import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  test('setAcceptingBookings patches only the dedicated field', () async {
    final adapter = _RecordingAdapter();
    final client = ApiClient(
      config: const AppConfig(
        environment: AppEnvironment.development,
        apiBaseUrl: 'http://127.0.0.1:3000',
      ),
      dio: Dio()..httpClientAdapter = adapter,
      authenticator: _Authenticator(),
    );

    final profile = await ExpertApi(client).setAcceptingBookings(true);

    expect(profile.isAcceptingBookings, isTrue);
    expect(adapter.last.method, 'PATCH');
    expect(adapter.last.path, '/api/v1/experts/me');
    expect(adapter.last.data, {'isAcceptingBookings': true});
    expect(adapter.last.headers['Authorization'], 'Bearer access-token');
  });
}

class _Authenticator implements ApiAuthenticator {
  @override
  Future<String?> accessToken() async => 'access-token';

  @override
  Future<String?> refreshAccessToken({String? failedAccessToken}) async => null;

  @override
  Future<void> sessionExpired() async {}
}

class _RecordingAdapter implements HttpClientAdapter {
  late RequestOptions last;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    last = options;
    final body = jsonEncode({
      'data': {
        'userId': 'expert-1',
        'name': 'Expert',
        'cityId': 1,
        'bio': null,
        'approvalStatus': 'approved',
        'isAcceptingBookings': true,
      },
    });
    return ResponseBody.fromString(
      body,
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
