import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class StoredSession {
  const StoredSession({
    required this.refreshToken,
    required this.refreshExpiresAt,
  });

  factory StoredSession.fromJson(Map<String, Object?> json) {
    if (json['version'] != 1) {
      throw const FormatException('Unsupported stored session version');
    }
    return StoredSession(
      refreshToken: json['refreshToken'] as String,
      refreshExpiresAt: DateTime.parse(json['refreshExpiresAt'] as String),
    );
  }

  final String refreshToken;
  final DateTime refreshExpiresAt;

  Map<String, Object?> toJson() => {
    'version': 1,
    'refreshToken': refreshToken,
    'refreshExpiresAt': refreshExpiresAt.toUtc().toIso8601String(),
  };
}

abstract interface class SessionStore {
  Future<StoredSession?> read();

  Future<void> write(StoredSession session);

  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({required String namespace, FlutterSecureStorage? storage})
    : _key = '${namespace}_mobile_session_v1',
      _storage = storage ?? const FlutterSecureStorage();

  final String _key;
  final FlutterSecureStorage _storage;

  @override
  Future<StoredSession?> read() async {
    final value = await _storage.read(key: _key);
    if (value == null) return null;
    final decoded = jsonDecode(value);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid stored session');
    }
    return StoredSession.fromJson(decoded);
  }

  @override
  Future<void> write(StoredSession session) =>
      _storage.write(key: _key, value: jsonEncode(session.toJson()));

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

class MemorySessionStore implements SessionStore {
  MemorySessionStore([this.value]);

  StoredSession? value;

  @override
  Future<void> clear() async => value = null;

  @override
  Future<StoredSession?> read() async => value;

  @override
  Future<void> write(StoredSession session) async => value = session;
}
