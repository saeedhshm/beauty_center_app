import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import 'auth_api.dart';
import 'models.dart';
import 'session_store.dart';

enum SessionPhase {
  restoring,
  anonymous,
  authenticated,
  offline,
  expired,
  wrongRole,
}

class SessionManager extends ChangeNotifier implements ApiAuthenticator {
  SessionManager({
    required this.expectedRole,
    required AuthGateway gateway,
    required SessionStore store,
    DateTime Function()? now,
  }) : _gateway = gateway,
       _store = store,
       _now = now ?? DateTime.now;

  final AuthRole expectedRole;
  final AuthGateway _gateway;
  final SessionStore _store;
  final DateTime Function() _now;

  SessionPhase _phase = SessionPhase.restoring;
  AuthSession? _session;
  StoredSession? _storedSession;
  Future<String?>? _refreshFuture;
  Future<void>? _bootstrapFuture;

  SessionPhase get phase => _phase;
  AuthUser? get user => _session?.user;
  bool get isAuthenticated => _phase == SessionPhase.authenticated;

  Future<void> bootstrap() {
    final active = _bootstrapFuture;
    if (active != null) return active;
    final future = _restore();
    _bootstrapFuture = future;
    return future.whenComplete(() {
      if (identical(_bootstrapFuture, future)) _bootstrapFuture = null;
    });
  }

  Future<void> _restore() async {
    _setPhase(SessionPhase.restoring);
    try {
      _storedSession = await _store.read();
    } on Object {
      await _safeClearStore();
      _setPhase(SessionPhase.anonymous);
      return;
    }
    final stored = _storedSession;
    if (stored == null) {
      _setPhase(SessionPhase.anonymous);
      return;
    }
    if (!stored.refreshExpiresAt.isAfter(_now())) {
      await _clear(SessionPhase.expired);
      return;
    }
    try {
      final session = await _gateway.refresh(stored.refreshToken);
      await _accept(session);
    } on ApiFailure catch (failure) {
      if (failure.code == 'WRONG_APP_ROLE') {
        _setPhase(SessionPhase.wrongRole);
      } else if (failure.kind == ApiFailureKind.offline ||
          failure.kind == ApiFailureKind.server) {
        _setPhase(SessionPhase.offline);
      } else {
        await _clear(SessionPhase.expired);
      }
    } on Object {
      await _clear(SessionPhase.expired);
    }
  }

  Future<void> login({required String phone, required String password}) async {
    final session = await _gateway.login(phone: phone, password: password);
    await _accept(session);
  }

  Future<OtpChallenge> requestRegistrationOtp(String phone) =>
      _gateway.requestRegistrationOtp(phone);

  Future<void> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
  }) async {
    final session = await _gateway.register(
      phone: phone,
      challengeId: challengeId,
      otp: otp,
      name: name,
      password: password,
      role: expectedRole,
    );
    await _accept(session);
  }

  Future<OtpChallenge> requestPasswordOtp(String phone) =>
      _gateway.requestPasswordOtp(phone);

  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  }) => _gateway.resetPassword(
    phone: phone,
    challengeId: challengeId,
    otp: otp,
    newPassword: newPassword,
  );

  Future<void> logout() async {
    final token = _session?.refreshToken ?? _storedSession?.refreshToken;
    try {
      if (token != null) await _gateway.logout(token);
    } on Object {
      // Local credentials must be removed even if remote revocation is offline.
    } finally {
      await _clear(SessionPhase.anonymous);
    }
  }

  Future<void> discardStoredSession() => _clear(SessionPhase.anonymous);

  void replaceUser(AuthUser user) {
    final session = _session;
    if (session == null || user.role != expectedRole) return;
    _session = AuthSession(
      user: user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
    );
    notifyListeners();
  }

  @override
  Future<String?> accessToken() async {
    final session = _session;
    if (session == null) return null;
    if (session.accessExpiresAt.isAfter(
      _now().add(const Duration(seconds: 30)),
    )) {
      return session.accessToken;
    }
    return refreshAccessToken(failedAccessToken: session.accessToken);
  }

  @override
  Future<String?> refreshAccessToken({String? failedAccessToken}) async {
    final current = _session;
    if (current != null &&
        failedAccessToken != null &&
        failedAccessToken != current.accessToken) {
      return current.accessToken;
    }
    final active = _refreshFuture;
    if (active != null) return active;
    final future = _performRefresh();
    _refreshFuture = future;
    try {
      return await future;
    } finally {
      if (identical(_refreshFuture, future)) _refreshFuture = null;
    }
  }

  Future<String?> _performRefresh() async {
    final token = _session?.refreshToken ?? _storedSession?.refreshToken;
    if (token == null) return null;
    try {
      final session = await _gateway.refresh(token);
      await _accept(session);
      return session.accessToken;
    } on ApiFailure catch (failure) {
      if (failure.kind == ApiFailureKind.offline ||
          failure.kind == ApiFailureKind.server) {
        _setPhase(SessionPhase.offline);
      } else {
        await _clear(SessionPhase.expired);
      }
      rethrow;
    } on Object {
      await _clear(SessionPhase.expired);
      rethrow;
    }
  }

  @override
  Future<void> sessionExpired() => _clear(SessionPhase.expired);

  Future<void> _accept(AuthSession session) async {
    if (session.user.role != expectedRole) {
      try {
        await _gateway.logout(session.refreshToken);
      } on Object {
        // The credential is still rejected and never persisted in this app.
      }
      await _clear(SessionPhase.anonymous);
      throw const ApiFailure(
        kind: ApiFailureKind.forbidden,
        code: 'WRONG_APP_ROLE',
        message: 'هذا الحساب مخصص لتطبيق آخر',
      );
    }
    final stored = StoredSession(
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
    );
    try {
      await _store.write(stored);
    } on Object {
      await _safeClearStore();
      throw const ApiFailure(
        kind: ApiFailureKind.unknown,
        code: 'SESSION_STORAGE_FAILED',
        message: 'تعذر حفظ الجلسة بأمان',
      );
    }
    _storedSession = stored;
    _session = session;
    _setPhase(SessionPhase.authenticated);
  }

  Future<void> _clear(SessionPhase phase) async {
    _session = null;
    _storedSession = null;
    await _safeClearStore();
    _setPhase(phase);
  }

  Future<void> _safeClearStore() async {
    try {
      await _store.clear();
    } on Object {
      // The in-memory session is still discarded and no token is logged.
    }
  }

  void _setPhase(SessionPhase value) {
    _phase = value;
    notifyListeners();
  }
}
