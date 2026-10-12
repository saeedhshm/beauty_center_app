import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  test('development configuration has a local default without secrets', () {
    final config = AppConfig.fromDartDefines();
    expect(config.environment, AppEnvironment.development);
    expect(config.apiBaseUrl, 'http://127.0.0.1:3000');
  });

  test('maps backend conflicts and preserves request id', () {
    final request = RequestOptions(path: '/api/v1/bookings/example');
    final exception = DioException(
      requestOptions: request,
      response: Response<Map<String, Object?>>(
        requestOptions: request,
        statusCode: 409,
        data: {
          'error': {'code': 'SLOT_TAKEN', 'message': 'الموعد لم يعد متاحًا'},
          'requestId': 'request-123',
        },
      ),
    );

    final failure = ApiFailure.fromDioException(exception);
    expect(failure.kind, ApiFailureKind.conflict);
    expect(failure.code, 'SLOT_TAKEN');
    expect(failure.requestId, 'request-123');
  });

  test('maps connection timeout without leaking the original request', () {
    final failure = ApiFailure.fromDioException(
      DioException(
        requestOptions: RequestOptions(path: '/private'),
        type: DioExceptionType.connectionTimeout,
      ),
    );
    expect(failure.kind, ApiFailureKind.timeout);
    expect(failure.toString(), isNot(contains('/private')));
  });

  test('maps upload and rate-limit responses with retry metadata', () {
    final request = RequestOptions(path: '/upload');
    final tooLarge = ApiFailure.fromDioException(
      DioException(
        requestOptions: request,
        response: Response<Object?>(requestOptions: request, statusCode: 413),
      ),
    );
    final limited = ApiFailure.fromDioException(
      DioException(
        requestOptions: request,
        response: Response<Object?>(
          requestOptions: request,
          statusCode: 429,
          headers: Headers.fromMap({
            'retry-after': ['60'],
          }),
        ),
      ),
    );

    expect(tooLarge.kind, ApiFailureKind.payloadTooLarge);
    expect(limited.retryAfterSeconds, 60);
  });

  test('authenticated request refreshes and replays only once', () async {
    final authenticator = FakeAuthenticator();
    final adapter = UnauthorizedOnceAdapter();
    final dio = Dio()..httpClientAdapter = adapter;
    final client = ApiClient(
      config: const AppConfig(
        environment: AppEnvironment.development,
        apiBaseUrl: 'http://127.0.0.1:3000',
      ),
      dio: dio,
      authenticator: authenticator,
    );

    final body = await client.get<Map<String, dynamic>>(
      '/api/v1/users/me',
      authenticated: true,
    );

    expect(body['data'], 'ok');
    expect(adapter.calls, 2);
    expect(authenticator.refreshCalls, 1);
    expect(adapter.authorization, ['Bearer old-access', 'Bearer new-access']);
  });

  test(
    'a second unauthorized response expires the session without a loop',
    () async {
      final authenticator = FakeAuthenticator();
      final adapter = AlwaysUnauthorizedAdapter();
      final dio = Dio()..httpClientAdapter = adapter;
      final client = ApiClient(
        config: const AppConfig(
          environment: AppEnvironment.development,
          apiBaseUrl: 'http://127.0.0.1:3000',
        ),
        dio: dio,
        authenticator: authenticator,
      );

      await expectLater(
        client.get<Map<String, dynamic>>('/private', authenticated: true),
        throwsA(isA<ApiFailure>()),
      );

      expect(adapter.calls, 2);
      expect(authenticator.refreshCalls, 1);
      expect(authenticator.expiredCalls, 1);
    },
  );
}

class FakeAuthenticator implements ApiAuthenticator {
  String token = 'old-access';
  int refreshCalls = 0;
  int expiredCalls = 0;

  @override
  Future<String?> accessToken() async => token;

  @override
  Future<String?> refreshAccessToken({String? failedAccessToken}) async {
    refreshCalls += 1;
    token = 'new-access';
    return token;
  }

  @override
  Future<void> sessionExpired() async => expiredCalls += 1;
}

class UnauthorizedOnceAdapter implements HttpClientAdapter {
  int calls = 0;
  final List<String?> authorization = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls += 1;
    authorization.add(options.headers['Authorization'] as String?);
    return ResponseBody.fromString(
      calls == 1
          ? '{"error":{"code":"UNAUTHENTICATED","message":"expired"}}'
          : '{"data":"ok"}',
      calls == 1 ? 401 : 200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class AlwaysUnauthorizedAdapter implements HttpClientAdapter {
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls += 1;
    return ResponseBody.fromString(
      '{"error":{"code":"UNAUTHENTICATED","message":"expired"}}',
      401,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
