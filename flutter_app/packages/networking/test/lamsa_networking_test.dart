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
}
