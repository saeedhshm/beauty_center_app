import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:test/test.dart';

void main() {
  late RecordingAdapter adapter;
  late ApiClient client;

  setUp(() {
    adapter = RecordingAdapter();
    client = ApiClient(
      config: const AppConfig(
        environment: AppEnvironment.development,
        apiBaseUrl: 'http://127.0.0.1:3000',
      ),
      dio: Dio()..httpClientAdapter = adapter,
      authenticator: TestAuthenticator(),
    );
  });

  test('models preserve decimal strings and reject numeric coercion', () {
    final expert = PublicExpert.fromJson({
      'id': 'expert-1',
      'name': 'خبيرة',
      'cityId': 1,
      'cityName': 'القاهرة',
      'bio': null,
      'ratingAvg': '4.50',
      'ratingCount': 8,
    });
    final address = CustomerAddress.fromJson({
      'id': 'address-1',
      'label': 'المنزل',
      'addressText': 'شارع الاختبار',
      'cityId': 1,
      'lat': '30.044400',
      'lng': '31.235700',
      'isDefault': true,
    });

    expect(expert.ratingAvg, '4.50');
    expect(address.lat, '30.044400');
    expect(
      () => PublicExpert.fromJson({
        'id': 'expert-1',
        'name': 'خبيرة',
        'cityId': 1,
        'cityName': 'القاهرة',
        'bio': null,
        'ratingAvg': 4.5,
        'ratingCount': 8,
      }),
      throwsFormatException,
    );
  });

  test('expert discovery sends exact filters without authentication', () async {
    adapter.respondWith = pageEnvelope([
      {
        'id': 'expert-1',
        'name': 'خبيرة',
        'cityId': 1,
        'cityName': 'القاهرة',
        'bio': null,
        'ratingAvg': '5.00',
        'ratingCount': 1,
      },
    ]);

    final page = await CatalogApi(
      client,
    ).experts(page: 2, limit: 10, cityId: 1, serviceId: 3, q: 'نور');

    expect(page.items.single.ratingAvg, '5.00');
    expect(adapter.last.path, '/api/v1/experts');
    expect(adapter.last.queryParameters, {
      'page': 2,
      'limit': 10,
      'cityId': 1,
      'serviceId': 3,
      'q': 'نور',
    });
    expect(adapter.last.headers['Authorization'], isNull);
  });

  test('address update can explicitly clear both coordinates', () async {
    adapter.respondWith = envelope({
      'id': 'address-1',
      'label': 'المنزل',
      'addressText': 'شارع الاختبار',
      'cityId': 1,
      'lat': null,
      'lng': null,
      'isDefault': false,
    });

    await AddressApi(
      client,
    ).update('address-1', const AddressDraft(includeCoordinates: true));

    expect(adapter.last.path, '/api/v1/addresses/address-1');
    expect(adapter.last.method, 'PATCH');
    expect(adapter.last.data, {'lat': null, 'lng': null});
    expect(adapter.last.headers['Authorization'], 'Bearer access-token');
  });

  test(
    'coordinate validation rejects partial pairs before a request',
    () async {
      expect(
        () =>
            const AddressDraft(includeCoordinates: true, lat: '30.1').toJson(),
        throwsFormatException,
      );
      await expectLater(
        AddressApi(client).create(
          label: 'المنزل',
          addressText: 'شارع الاختبار',
          cityId: 1,
          lat: '30.1',
        ),
        throwsFormatException,
      );
      expect(adapter.calls, isEmpty);
    },
  );

  test('workspace upload includes serviceId and authentication', () async {
    adapter.respondWith = envelope({
      'id': 'image-1',
      'serviceId': 7,
      'sortOrder': 0,
      'url': '/api/v1/portfolio/image-1/file',
    });

    await ExpertWorkspaceApi(client).uploadPortfolio(
      bytes: [1, 2, 3],
      filename: 'work.jpg',
      contentType: 'image/jpeg',
      serviceId: 7,
    );

    final form = adapter.last.data! as FormData;
    expect(adapter.last.path, '/api/v1/experts/me/portfolio');
    expect(adapter.last.headers['Authorization'], 'Bearer access-token');
    expect(Map.fromEntries(form.fields)['serviceId'], '7');
    expect(form.files.single.key, 'image');
    expect(form.files.single.value.filename, 'work.jpg');
  });

  test('workspace upsert sends the backend price contract', () async {
    adapter.respondWith = envelope({
      'expertId': 'expert-1',
      'serviceId': 7,
      'price': '250.00',
      'currency': 'EGP',
      'isActive': true,
    });

    final service = await ExpertWorkspaceApi(
      client,
    ).upsertService(serviceId: 7, price: '250.00', isActive: true);

    expect(service.price, '250.00');
    expect(adapter.last.path, '/api/v1/experts/me/services/7');
    expect(adapter.last.data, {'price': '250.00', 'isActive': true});
    expect(adapter.last.headers['Authorization'], 'Bearer access-token');
  });
}

String envelope(Object? data) =>
    jsonEncode({'data': data, 'requestId': 'test'});

String pageEnvelope(List<Object?> items) => envelope({
  'items': items,
  'pagination': {'page': 2, 'limit': 10, 'hasNext': false},
});

class TestAuthenticator implements ApiAuthenticator {
  @override
  Future<String?> accessToken() async => 'access-token';

  @override
  Future<String?> refreshAccessToken({String? failedAccessToken}) async => null;

  @override
  Future<void> sessionExpired() async {}
}

class RecordingAdapter implements HttpClientAdapter {
  final List<RequestOptions> calls = [];
  String respondWith = envelope(null);

  RequestOptions get last => calls.last;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls.add(options);
    return ResponseBody.fromString(
      respondWith,
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
