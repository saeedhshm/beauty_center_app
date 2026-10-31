import 'dart:async';

import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import 'push_provider.dart';

/// Owns the device-token lifecycle against the real backend contract:
///
/// - login: initialize, request permission, register the token, remember the
///   server row id for logout cleanup;
/// - rotation: drop the previous owned row, then register the new token (the
///   server has no update endpoint, so replace is the only stale-free shape);
/// - logout: remove the server row while the session is still valid, then
///   always clear the local copy, even when the server call fails. A failed
///   delete never blocks logout; see [_deleteRememberedRow].
///
/// Everything degrades silently when Firebase is unconfigured or permission
/// is denied: the in-app notification center keeps working regardless.
///
/// Residual risk (no server-side cleanup exists): `device_tokens` has no expiry
/// column and no cleanup job, so a row whose delete failed and which is never
/// seen again stays on the server. The only recovery is the next login on the
/// same device, where `POST /devices` upserts by token and returns the same
/// row id, so a later logout can delete it.
///
/// Concurrency: register/remove mutations run strictly serialized, and every
/// register carries the epoch captured when its task started. Cleanup
/// boundaries (logout hook, teardown) cancel rotation intake and bump the
/// epoch synchronously, so in-flight rotation work aborts instead of
/// creating rows after cleanup.
class PushRegistrar {
  PushRegistrar({
    required PushProvider provider,
    required NotificationGateway gateway,
  }) : _provider = provider,
       _gateway = gateway;

  final PushProvider _provider;
  final NotificationGateway _gateway;
  StreamSubscription<String>? _rotation;
  String? _serverDeviceId;
  String? _lastToken;
  bool _syncing = false;

  /// Cap on consecutive failed attempts for one token. Retries are event-driven
  /// (network back / app resume), never a loop or a timer, so this only caps
  /// churn when the same failure repeats.
  static const int maxRegistrationAttempts = 3;

  /// True while a retryable failure has no registration yet. Cleared as soon
  /// as a row exists, so a healthy session never registers twice.
  bool _retryPending = false;
  int _failedAttempts = 0;

  /// Permission outcome for this session: null until first asked. A denial is
  /// remembered so no later retry re-prompts the user.
  PushPermission? _permission;
  // Bumped synchronously on every cleanup boundary (logout hook, teardown).
  // Register tasks capture it when they start and re-check after every
  // await; a mismatch means cleanup already ran, so they must not adopt.
  int _epoch = 0;
  // Serializes register/remove mutations so concurrent rotations cannot
  // interleave delete-then-register pairs and leak a row. Chained futures:
  // never awaited from inside a task, so no deadlock; Dio timeouts bound it.
  Future<void> _chain = Future<void>.value();

  /// Locally remembered server row, used only for logout cleanup.
  String? get serverDeviceId => _serverDeviceId;

  /// The token source, exposed so message routing can share this instance
  /// instead of initializing Firebase twice.
  PushProvider get provider => _provider;

  /// Entry point on becoming authenticated, and the body of every retry.
  ///
  /// A transient failure arms a bounded, event-driven retry instead of leaving
  /// push dead for the whole session; it never throws, so the app is usable
  /// either way. No token or secret is ever logged.
  Future<void> syncOnLogin() async {
    if (_syncing) return;
    _syncing = true;
    try {
      if (!await _provider.ensureInitialized()) {
        _armRetry();
        return;
      }
      // Already registered for this exact token (e.g. rebinding after a
      // rebuild): skip silently instead of re-prompting and re-registering.
      final current = await _provider.token();
      if (current != null &&
          current.isNotEmpty &&
          current == _lastToken &&
          _serverDeviceId != null) {
        _succeeded();
        _listenRotation();
        return;
      }
      if (_permission == null) {
        _permission = await _provider.requestPermission();
      }
      if (_permission != PushPermission.granted) {
        // Denied: never ask again in this session, and never retry it.
        _retryPending = false;
        return;
      }
      await _registerCurrent();
      _listenRotation();
    } on Object {
      // Push bookkeeping must never break login.
      _armRetry();
    } finally {
      _syncing = false;
    }
  }

  void _listenRotation() {
    _rotation ??= _provider.onTokenRefresh.listen((_) async {
      await _registerCurrent();
    });
  }

  void _succeeded() {
    _retryPending = false;
    _failedAttempts = 0;
  }

  /// Arms one bounded retry. The budget is per token: a new token after
  /// rotation starts fresh because registration resets the counters.
  void _armRetry() {
    if (_permission == PushPermission.denied) return;
    if (_failedAttempts >= maxRegistrationAttempts) {
      _retryPending = false;
      return;
    }
    _failedAttempts++;
    _retryPending = true;
  }

  /// Retries a pending registration. Meant for event handlers (network back,
  /// app resume). No-op when nothing is pending, when a row already exists,
  /// when permission was denied, or when the attempt budget is spent, so it can
  /// never register the same device twice.
  Future<void> retryPending() async {
    if (!_retryPending) return;
    if (_permission == PushPermission.denied) return;
    if (_serverDeviceId != null && _lastToken != null) return;
    if (_failedAttempts >= maxRegistrationAttempts) {
      // Budget spent: stop advertising a retry that can never run.
      _retryPending = false;
      return;
    }
    _retryPending = false;
    await syncOnLogin();
  }

  /// True while a retry is armed and still allowed: exposed for tests and
  /// diagnostics, never for token contents.
  bool get hasPendingRetry => _retryPending;

  Future<T> _serialized<T>(Future<T> Function() task) {
    final next = _chain.then((_) => task());
    _chain = next.then<void>((_) {}, onError: (_) {});
    return next;
  }

  Future<void> _registerCurrent() async {
    await _serialized(() async {
      final epoch = _epoch;
      final token = await _provider.token();
      if (token == null || token.isEmpty) return;
      if (epoch != _epoch) return;
      // Replace, don't append: drop the previously owned row first so a
      // rotated token never leaves a stale row behind.
      await _deleteRememberedRow();
      if (epoch != _epoch) return;
      late final RegisteredDevice device;
      try {
        device = await _gateway.registerDevice(token);
      } on Object {
        // Server errors never break login; an event-driven retry may follow.
        _armRetry();
        return;
      }
      if (epoch != _epoch) {
        // A cleanup boundary passed while registering: the fresh row is
        // stale and must not be adopted. Best effort to drop it. If that call
        // fails there is no session left to retry with and the backend has no
        // cleanup for device rows, so the row can survive until this device
        // logs in again and upserts the same token (documented residual gap,
        // no backend change here).
        try {
          await _gateway.removeDevice(device.id);
        } on Object {}
        return;
      }
      _serverDeviceId = device.id;
      _lastToken = token;
      _succeeded();
    });
  }

  /// Removes the remembered server row while the session is still valid.
  ///
  /// Returns whether the row is gone from the server. The remembered id is
  /// kept when the call fails, so a later attempt can still delete it; logout
  /// is never blocked by this, it only reports the outcome. One call per
  /// invocation — repeating it is safe and idempotent, so callers that want a
  /// second try may simply call again.
  Future<bool> removeServerDevice() async {
    final sub = _rotation;
    _rotation = null;
    _epoch++;
    try {
      await sub?.cancel();
    } on Object {
      // Cancellation must never block logout.
    }
    return _serialized(_deleteRememberedRow);
  }

  /// Deletes the remembered row and clears the id **only** once the server
  /// confirms the end state.
  ///
  /// A 404 means the row is already gone, which is the desired state, so it is
  /// treated as success and makes repeated attempts idempotent. Every other
  /// failure keeps the id: discarding it before a confirmed delete would make
  /// the orphan unrecoverable. There is no server-side retention behind this —
  /// an unconfirmed delete leaves the row until this device logs in again.
  Future<bool> _deleteRememberedRow() async {
    final id = _serverDeviceId;
    if (id == null) return true;
    try {
      await _gateway.removeDevice(id);
    } on ApiFailure catch (failure) {
      if (failure.kind == ApiFailureKind.notFound) {
        _serverDeviceId = null;
        return true;
      }
      return false;
    } on Object {
      return false;
    }
    _serverDeviceId = null;
    return true;
  }

  /// Local-only cleanup: deletes the device token copy without any server
  /// call. Used when the session is already gone or expired.
  ///
  /// After logout the session is gone, so a remembered id has no further use
  /// and is dropped with the rest of the local copy.
  Future<void> clearLocal() async {
    _serverDeviceId = null;
    _lastToken = null;
    _retryPending = false;
    _failedAttempts = 0;
    try {
      await _provider.deleteToken();
    } on Object {
      // Best effort.
    }
  }

  /// Logout proceeds no matter what the delete does. When it fails the local
  /// copy is still cleared and the server keeps the row until this device logs
  /// in again; logout is never held up by it.
  Future<void> syncOnLogout() async {
    await _rotation?.cancel();
    _rotation = null;
    await removeServerDevice();
    await clearLocal();
  }

  Future<void> dispose() async {
    await _rotation?.cancel();
    _rotation = null;
  }
}
