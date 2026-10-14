import 'dart:async';

import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('login registers the token and remembers the server row', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);

    await registrar.syncOnLogin();

    expect(gateway.registered, ['device-token']);
    expect(registrar.serverDeviceId, 'device-1');
    await registrar.dispose();
  });

  test('rotation replaces the owned row without leaving a stale one', () async {
    final provider = _PushProvider(token: 'token-a');
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();

    provider.rotate('token-b');
    await Future<void>.delayed(Duration.zero);

    expect(gateway.registered, ['token-a', 'token-b']);
    expect(gateway.removed, ['device-1']);
    expect(registrar.serverDeviceId, 'device-2');
    await registrar.dispose();
  });

  test('denied permission registers nothing', () async {
    final provider = _PushProvider(
      token: 'device-token',
      permission: PushPermission.denied,
    );
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);

    await registrar.syncOnLogin();

    expect(gateway.registered, isEmpty);
    await registrar.dispose();
  });

  test('logout deletes locally and removes the server row best-effort', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();

    await registrar.syncOnLogout();

    expect(provider.deleted, isTrue);
    expect(gateway.removed, ['device-1']);
    expect(registrar.serverDeviceId, isNull);
  });

  test('server removal keeps local state for the caller to clear', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();

    await registrar.removeServerDevice();

    expect(gateway.removed, ['device-1']);
    expect(registrar.serverDeviceId, isNull);
    expect(provider.deleted, isFalse);
  });

  test('local cleanup never touches the server', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();
    gateway.removed.clear();

    await registrar.clearLocal();

    expect(gateway.removed, isEmpty);
    expect(provider.deleted, isTrue);
    expect(registrar.serverDeviceId, isNull);
  });

  test('unconfigured Firebase keeps login working', () async {
    final provider = _PushProvider(token: null, initialized: false);
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);

    await registrar.syncOnLogin();

    expect(gateway.registered, isEmpty);
    await registrar.dispose();
  });
}

class _PushProvider implements PushProvider {
  _PushProvider({
    required String? token,
    this.permission = PushPermission.granted,
    this.initialized = true,
  }) : currentToken = token;

  String? currentToken;
  final PushPermission permission;
  final bool initialized;
  bool deleted = false;
  final _rotations = StreamController<String>.broadcast();

  void rotate(String next) {
    currentToken = next;
    _rotations.add(next);
  }

  @override
  Future<bool> ensureInitialized() async => initialized;

  @override
  Future<PushPermission> requestPermission() async => permission;

  @override
  Future<String?> token() async => currentToken;

  @override
  Stream<String> get onTokenRefresh => _rotations.stream;

  @override
  Future<void> deleteToken() async {
    deleted = true;
  }
}

class _NotificationGateway implements NotificationGateway {
  final registered = <String>[];
  final removed = <String>[];

  @override
  Future<RegisteredDevice> registerDevice(String token) async {
    registered.add(token);
    return RegisteredDevice(
      id: 'device-${registered.length}',
      createdAt: '2026-10-14T06:00:00.000Z',
    );
  }

  @override
  Future<List<RegisteredDevice>> devices() => throw UnimplementedError();

  @override
  Future<void> removeDevice(String id) async {
    removed.add(id);
  }

  @override
  Future<CatalogPage<AppNotification>> notifications({
    bool unreadOnly = false,
    int page = 1,
  }) => throw UnimplementedError();

  @override
  Future<int> unreadCount() => throw UnimplementedError();

  @override
  Future<void> markRead(String id) => throw UnimplementedError();

  @override
  Future<void> markAllRead() => throw UnimplementedError();
}
