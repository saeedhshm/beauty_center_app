import 'dart:async';

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
/// - normal `logout` removes the server row first through
///   [SessionManager.onBeforeLogout], while the access token is still valid.
///
/// All failures are swallowed: push bookkeeping must never break login,
/// logout, or rebuilds. No tokens are logged.
class PushSessionSync {
  PushSessionSync({
    required SessionManager manager,
    required PushRegistrar registrar,
  }) : _manager = manager,
       _registrar = registrar;

  final SessionManager _manager;
  final PushRegistrar _registrar;
  bool _attached = false;
  bool _wasAuthenticated = false;
  Future<void> Function()? _hook;

  /// Idempotent: repeated calls (e.g. provider rebuilds) never duplicate
  /// subscriptions or registrations.
  void attach() {
    if (_attached) return;
    _attached = true;
    _hook = _registrar.removeServerDevice;
    _manager.onBeforeLogout = _hook;
    _manager.addListener(_onChanged);
    unawaited(_sync());
  }

  Future<void> dispose() async {
    _manager.removeListener(_onChanged);
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
        await _registrar.syncOnLogin();
      } else if (!authenticated && was) {
        await _registrar.clearLocal();
      }
    } on Object {
      // Push bookkeeping must never break the app.
    }
  }
}
