import 'dart:async';

import 'package:lamsa_catalog/lamsa_catalog.dart';

import 'push_provider.dart';

/// Owns the device-token lifecycle against the real backend contract:
///
/// - login: initialize, request permission, register the token, remember the
///   server row id for logout cleanup;
/// - rotation: re-register the new token (server has no update endpoint);
/// - logout: delete the local token and remove the server row best-effort.
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
  bool _syncing = false;

  /// Locally remembered server row, used only for logout cleanup.
  String? get serverDeviceId => _serverDeviceId;

  Future<void> syncOnLogin() async {
    if (_syncing) return;
    _syncing = true;
    try {
      if (!await _provider.ensureInitialized()) return;
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
    try {
      final device = await _gateway.registerDevice(token);
      _serverDeviceId = device.id;
    } on Object {
      // Server errors never break login; the next login retries.
    }
  }

  Future<void> syncOnLogout() async {
    await _rotation?.cancel();
    _rotation = null;
    try {
      await _provider.deleteToken();
    } on Object {
      // Best effort.
    }
    final id = _serverDeviceId;
    _serverDeviceId = null;
    if (id == null) return;
    try {
      await _gateway.removeDevice(id);
    } on Object {
      // Best effort; stale rows expire server-side by retention.
    }
  }

  Future<void> dispose() async {
    await _rotation?.cancel();
    _rotation = null;
  }
}
