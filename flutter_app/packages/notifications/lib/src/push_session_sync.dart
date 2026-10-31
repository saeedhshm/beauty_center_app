import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';

import 'push_registrar.dart';

/// Binds [SessionManager] transitions to the device-token lifecycle.
///
/// Unlike watching a plain provider value (which never changes for a
/// [ChangeNotifier]), this subscribes to the manager itself, so every phase
/// transition is observed exactly once:
///
/// - entering `authenticated` (login or valid bootstrap restore) registers
///   the token once; permission is therefore never requested pre-auth;
/// - leaving `authenticated` for any other phase clears only the local copy,
///   because the session may already be expired;
/// - a stored session that resolves as unusable (expired or rejected) without
///   ever authenticating sweeps the local token once, so the device stops
///   receiving pushes for it — local-only, no permission prompt, no server
///   call, since there is no valid credential anymore;
/// - normal `logout` removes the server row first through
///   [SessionManager.onBeforeLogout], while the access token is still valid.
///
/// A transient failure (Firebase not initialized yet, or `POST /devices`
/// failing) must not leave push dead for the rest of the session, so two
/// already-available events drive a bounded retry: the app returning to the
/// foreground, and connectivity coming back. Both are passed in, so this class
/// adds no timer, no polling loop, and no dependency. A retry only runs while
/// the session is authenticated, which keeps it serialized with logout.
///
/// All failures are swallowed: push bookkeeping must never break login,
/// logout, or rebuilds. No tokens are logged.
class PushSessionSync with WidgetsBindingObserver {
  PushSessionSync({
    required SessionManager manager,
    required PushRegistrar registrar,
    Stream<bool>? connectivityChanges,
  }) : _manager = manager,
       _registrar = registrar,
       _connectivity = connectivityChanges;

  final SessionManager _manager;
  final PushRegistrar _registrar;

  /// Emits true when the device regains connectivity.
  final Stream<bool>? _connectivity;
  StreamSubscription<bool>? _connectivitySub;
  bool _attached = false;
  bool _wasAuthenticated = false;
  bool _invalidSwept = false;
  Future<void> Function()? _hook;

  /// Idempotent: repeated calls (e.g. provider rebuilds) never duplicate
  /// subscriptions or registrations.
  void attach() {
    if (_attached) return;
    _attached = true;
    _hook = _registrar.removeServerDevice;
    _manager.onBeforeLogout = _hook;
    _manager.addListener(_onChanged);
    WidgetsBinding.instance.addObserver(this);
    final connectivity = _connectivity;
    if (connectivity != null) {
      _connectivitySub = connectivity.listen((online) {
        if (online) unawaited(retryPending());
      });
    }
    unawaited(_sync());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Foregrounding is the natural moment to pick up a registration that
    // failed while backgrounded.
    if (state == AppLifecycleState.resumed) unawaited(retryPending());
  }

  /// Retries a pending registration while authenticated. Safe to call at any
  /// time: the registrar ignores it when nothing is pending, when a row
  /// already exists, or when the user denied permission.
  Future<void> retryPending() async {
    if (!_manager.isAuthenticated) return;
    await _registrar.retryPending();
  }

  Future<void> dispose() async {
    _manager.removeListener(_onChanged);
    WidgetsBinding.instance.removeObserver(this);
    await _connectivitySub?.cancel();
    _connectivitySub = null;
    if (_hook != null && identical(_manager.onBeforeLogout, _hook)) {
      _manager.onBeforeLogout = null;
    }
    _hook = null;
    _attached = false;
  }

  void _onChanged() {
    unawaited(_sync().catchError((Object _) {}));
  }

  Future<void> _sync() async {
    try {
      final authenticated = _manager.isAuthenticated;
      final was = _wasAuthenticated;
      _wasAuthenticated = authenticated;
      if (authenticated && !was) {
        _invalidSwept = false;
        await _registrar.syncOnLogin();
      } else if (!authenticated && was) {
        await _registrar.clearLocal();
      } else if (!authenticated &&
          !was &&
          !_invalidSwept &&
          (_manager.phase == SessionPhase.expired ||
              _manager.phase == SessionPhase.wrongRole)) {
        // The app started from a stored session that already resolved as
        // unusable without ever authenticating: drop any leftover local
        // token so this device stops receiving its pushes. Strictly local
        // and idempotent — no permission prompt and no server call, since
        // no valid credential exists. Transient or undecided phases
        // (`restoring`, `offline`, `anonymous`) are left untouched.
        _invalidSwept = true;
        await _registrar.clearLocal();
      }
    } on Object {
      // Push bookkeeping must never break the app.
    }
  }
}
