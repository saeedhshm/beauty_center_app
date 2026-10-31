import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';

const _transient = ApiFailure(
  kind: ApiFailureKind.server,
  code: 'FAILED',
  message: 'temporary',
);
const _notFound = ApiFailure(
  kind: ApiFailureKind.notFound,
  code: 'NOT_FOUND',
  message: 'already gone',
);
const _unauthorized = ApiFailure(
  kind: ApiFailureKind.unauthorized,
  code: 'UNAUTHENTICATED',
  message: 'expired',
);

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

  test(
    'in-flight rotation cannot resurrect a row across logout cleanup',
    () async {
      final provider = _PushProvider(token: 'token-a');
      final gateway = _NotificationGateway();
      final registrar = PushRegistrar(provider: provider, gateway: gateway);
      await registrar.syncOnLogin();
      expect(registrar.serverDeviceId, 'device-1');

      // Rotation starts but hangs reading the token.
      final stuckToken = Completer<String?>();
      provider.tokenGate = stuckToken;
      provider.rotate('token-b');
      await Future<void>.delayed(Duration.zero);

      // Logout cleanup (as the onBeforeLogout hook calls it) runs while the
      // rotation is stuck, then the rotation resumes afterwards.
      final cleanup = registrar.removeServerDevice();
      stuckToken.complete('token-b');
      await cleanup;
      await Future<void>.delayed(Duration.zero);

      // The resumed rotation must abort: no row for token-b may exist.
      expect(gateway.registered, ['token-a']);
      expect(gateway.removed, ['device-1']);
      expect(registrar.serverDeviceId, isNull);

      await registrar.clearLocal();
      expect(provider.deleted, isTrue);
      await registrar.dispose();
    },
  );

  test('concurrent rotations serialize into a single adopted row', () async {
    final provider = _PushProvider(token: 'token-a');
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();

    provider.tokenScript.addAll(['token-b', 'token-c']);
    final registerB = Completer<RegisteredDevice>();
    final registerC = Completer<RegisteredDevice>();
    gateway.registerGates.addAll([registerB, registerC]);
    provider.rotate('x');
    provider.rotate('y');
    await Future<void>.delayed(Duration.zero);

    registerB.complete(
      const RegisteredDevice(
        id: 'device-2',
        createdAt: '2026-10-14T06:00:00.000Z',
      ),
    );
    await Future<void>.delayed(Duration.zero);
    registerC.complete(
      const RegisteredDevice(
        id: 'device-3',
        createdAt: '2026-10-14T06:00:00.000Z',
      ),
    );
    await Future<void>.delayed(Duration.zero);
    await registrar.dispose();

    expect(gateway.registered, ['token-a', 'token-b', 'token-c']);
    expect(gateway.removed, ['device-1', 'device-2']);
    expect(registrar.serverDeviceId, 'device-3');
  });

  test(
    'logout cleanup removes the row while authenticated and always clears local state',
    () async {
      final provider = _PushProvider(token: 'token-a');
      final gateway = _NotificationGateway()..removeError = Exception('boom');
      final registrar = PushRegistrar(provider: provider, gateway: gateway);
      await registrar.syncOnLogin();

      // The server delete fails, but logout must still complete locally.
      await registrar.syncOnLogout();

      expect(gateway.removed, ['device-1']);
      expect(registrar.serverDeviceId, isNull);
      expect(provider.deleted, isTrue);
    },
  );

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

  test(
    'logout deletes locally and removes the server row best-effort',
    () async {
      final provider = _PushProvider(token: 'device-token');
      final gateway = _NotificationGateway();
      final registrar = PushRegistrar(provider: provider, gateway: gateway);
      await registrar.syncOnLogin();

      await registrar.syncOnLogout();

      expect(provider.deleted, isTrue);
      expect(gateway.removed, ['device-1']);
      expect(registrar.serverDeviceId, isNull);
    },
  );

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

  test('a failed delete keeps the id so a later attempt can succeed', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway()..removeError = _transient;
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();
    expect(registrar.serverDeviceId, 'device-1');

    gateway.removed.clear();
    // The attempt fails: the remembered row must survive.
    final removed = await registrar.removeServerDevice();

    expect(removed, isFalse);
    expect(gateway.removed, ['device-1']);
    expect(
      registrar.serverDeviceId,
      'device-1',
      reason: 'the id must not be discarded before the server confirms',
    );

    // The retry after the failure succeeds and only then clears the id.
    gateway.removeError = null;
    expect(await registrar.removeServerDevice(), isTrue);

    expect(gateway.removed, ['device-1', 'device-1']);
    expect(registrar.serverDeviceId, isNull);
  });

  test('a repeated delete after success is idempotent on a 404', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();
    gateway.removed.clear();

    expect(await registrar.removeServerDevice(), isTrue);
    expect(registrar.serverDeviceId, isNull);
    gateway.removed.clear();

    // Nothing remembered: no call, and no failure.
    gateway.removeError = _transient;
    expect(await registrar.removeServerDevice(), isTrue);
    expect(gateway.removed, isEmpty);

    // A row already deleted server-side reports 404, which is the desired end
    // state rather than an error.
    gateway.removeError = _notFound;
    expect(await registrar.removeServerDevice(), isTrue);
    expect(gateway.removed, isEmpty);
  });

  test('logout is never blocked when the delete keeps failing', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway()..removeError = _transient;
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();

    await registrar.syncOnLogout();

    // Local state is gone even though the server row could not be deleted.
    expect(provider.deleted, isTrue);
    expect(registrar.serverDeviceId, isNull);
  });

  test(
    'a lost session is not retried and keeps the id for the caller',
    () async {
      final provider = _PushProvider(token: 'device-token');
      final gateway = _NotificationGateway()..removeError = _unauthorized;
      final registrar = PushRegistrar(provider: provider, gateway: gateway);
      await registrar.syncOnLogin();
      gateway.removed.clear();

      // 401 cannot succeed without credentials, so it is attempted once and
      // reported, not retried into a second pointless call.
      final removed = await registrar.removeServerDevice();

      expect(removed, isFalse);
      expect(gateway.removed, ['device-1']);
      expect(registrar.serverDeviceId, 'device-1');
    },
  );

  test('a failed initialization retries once it recovers', () async {
    final provider = _PushProvider(token: 'device-token', initialized: false);
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);

    await registrar.syncOnLogin();

    expect(gateway.registered, isEmpty);
    expect(registrar.hasPendingRetry, isTrue);

    // Firebase becomes available and an event drives the retry.
    provider.initialized = true;
    await registrar.retryPending();

    expect(gateway.registered, ['device-token']);
    expect(registrar.serverDeviceId, 'device-1');
    expect(registrar.hasPendingRetry, isFalse);
  });

  test('a failed register retries and succeeds on the next attempt', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway()..registerError = _transient;
    final registrar = PushRegistrar(provider: provider, gateway: gateway);

    await registrar.syncOnLogin();

    expect(gateway.registered, ['device-token']);
    expect(registrar.serverDeviceId, isNull);
    expect(registrar.hasPendingRetry, isTrue);

    gateway.registerError = null;
    await registrar.retryPending();

    expect(gateway.registered, ['device-token', 'device-token']);
    // The id comes from the successful call, not from the failed attempt.
    expect(registrar.serverDeviceId, 'device-2');
    expect(registrar.hasPendingRetry, isFalse);
  });

  test('a successful registration is never repeated', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();
    expect(gateway.registered, hasLength(1));

    // Nothing is pending, so any number of events are no-ops.
    await registrar.retryPending();
    await registrar.retryPending();
    await registrar.syncOnLogin();

    expect(gateway.registered, hasLength(1));
    expect(registrar.serverDeviceId, 'device-1');
  });

  test('no retry happens after logout', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway()..registerError = _transient;
    final registrar = PushRegistrar(provider: provider, gateway: gateway);
    await registrar.syncOnLogin();
    expect(registrar.hasPendingRetry, isTrue);

    gateway.registerError = null;
    await registrar.syncOnLogout();
    expect(registrar.hasPendingRetry, isFalse);
    gateway.registered.clear();

    // A late event must not register a device after the user signed out.
    await registrar.retryPending();

    expect(gateway.registered, isEmpty);
    expect(registrar.serverDeviceId, isNull);
  });

  test('a denied permission is never asked or retried again', () async {
    final provider = _PushProvider(
      token: 'device-token',
      permission: PushPermission.denied,
    );
    final gateway = _NotificationGateway();
    final registrar = PushRegistrar(provider: provider, gateway: gateway);

    await registrar.syncOnLogin();
    await registrar.retryPending();
    await registrar.retryPending();

    expect(gateway.registered, isEmpty);
    expect(registrar.hasPendingRetry, isFalse);
  });

  test('the attempt budget bounds repeated failures', () async {
    final provider = _PushProvider(token: 'device-token');
    final gateway = _NotificationGateway()..registerError = _transient;
    final registrar = PushRegistrar(provider: provider, gateway: gateway);

    await registrar.syncOnLogin();
    for (var i = 0; i < 5; i++) {
      await registrar.retryPending();
    }

    expect(
      gateway.registered,
      hasLength(PushRegistrar.maxRegistrationAttempts),
    );
    expect(registrar.hasPendingRetry, isFalse);
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

  /// Mutable so a test can simulate initialization recovering later.
  bool initialized;
  bool deleted = false;
  Completer<String?>? tokenGate;
  final List<String?> tokenScript = [];
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
  Future<String?> token() async {
    final gate = tokenGate;
    tokenGate = null;
    if (gate != null) return gate.future;
    if (tokenScript.isNotEmpty) return tokenScript.removeAt(0);
    return currentToken;
  }

  @override
  Stream<String> get onTokenRefresh => _rotations.stream;

  @override
  Stream<PushEnvelope> get onForegroundMessage => const Stream.empty();

  @override
  Stream<PushEnvelope> get onOpenedMessage => const Stream.empty();

  @override
  Future<PushEnvelope?> initialMessage() async => null;

  @override
  Future<void> deleteToken() async {
    deleted = true;
  }
}

class _NotificationGateway implements NotificationGateway {
  final registered = <String>[];
  final removed = <String>[];
  final List<Completer<RegisteredDevice>> registerGates = [];
  Completer<void>? removeGate;
  Object? removeError;

  /// Set to fail `POST /devices` without breaking anything else.
  Object? registerError;

  @override
  Future<RegisteredDevice> registerDevice(String token) async {
    registered.add(token);
    final error = registerError;
    if (error != null) throw error;
    if (registerGates.isNotEmpty) {
      return registerGates.removeAt(0).future;
    }
    return RegisteredDevice(
      id: 'device-${registered.length}',
      createdAt: '2026-10-14T06:00:00.000Z',
    );
  }

  @override
  Future<List<RegisteredDevice>> devices() => throw UnimplementedError();

  @override
  Future<void> removeDevice(String id) async {
    final gate = removeGate;
    removeGate = null;
    if (gate != null) await gate.future;
    removed.add(id);
    if (removeError != null) throw removeError!;
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
