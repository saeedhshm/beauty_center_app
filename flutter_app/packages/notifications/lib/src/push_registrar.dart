import 'dart:async';

import 'package:lamsa_catalog/lamsa_catalog.dart';

import 'push_provider.dart';

/// Owns the device-token lifecycle against the real backend contract:
///
/// - login: initialize, request permission, register the token, remember the
///   server row id for logout cleanup;
/// - rotation: drop the previous owned row, then register the new token (the
///   server has no update endpoint, so replace is the only stale-free shape);
/// - logout: remove the server row while the session is still valid, then
///   always clear the local copy, even when the server call fails.
///
/// Everything degrades silently when Firebase is unconfigured or permission
/// is denied: the in-app notification center keeps working regardless.
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

  /// Locally remembered server row, used only for logout cleanup.
  String? get serverDeviceId => _serverDeviceId;

  Future<void> syncOnLogin() async {
    if (_syncing) return;
    _syncing = true;
    try {
      if (!await _provider.ensureInitialized()) return;
      // Already registered for this exact token (e.g. rebinding after a
      // rebuild): skip silently instead of re-prompting and re-registering.
      final current = await _provider.token();
      if (current != null &&
          current.isNotEmpty &&
          current == _lastToken &&
          _serverDeviceId != null) {
        _rotation ??= _provider.onTokenRefresh.listen((_) async {
          await _registerCurrent();
        });
        return;
      }
      if (await _provider.requestPermission() != PushPermission.granted) {
        return;
      }
      await _registerCurrent();
      _rotation ??= _provider.onTokenRefresh.listen((_) async {
        await _registerCurrent();
      });
    } finally {
      _syncing = false;
    }
  }

  Future<void> _registerCurrent() async {
    final token = await _provider.token();
    if (token == null || token.isEmpty) return;
    // Replace, don't append: drop the previously owned row first so a
    // rotated token never leaves a stale row behind.
    await removeServerDevice();
    try {
      final device = await _gateway.registerDevice(token);
      _serverDeviceId = device.id;
      _lastToken = token;
    } on Object {
      // Server errors never break login; the next login retries.
    }
  }

  /// Best-effort removal of the remembered server row. Safe to call while
  /// authenticated (logout hook) — never touches local state.
  Future<void> removeServerDevice() async {
    final id = _serverDeviceId;
    _serverDeviceId = null;
    if (id == null) return;
    try {
      await _gateway.removeDevice(id);
    } on Object {
      // Best effort; stale rows expire server-side by retention.
    }
  }

  /// Local-only cleanup: deletes the device token copy without any server
  /// call. Used when the session is already gone or expired.
  Future<void> clearLocal() async {
    _serverDeviceId = null;
    _lastToken = null;
    try {
      await _provider.deleteToken();
    } on Object {
      // Best effort.
    }
  }

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
