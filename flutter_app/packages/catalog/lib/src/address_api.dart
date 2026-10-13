import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

class AddressDraft {
  const AddressDraft({
    this.label,
    this.addressText,
    this.cityId,
    this.lat,
    this.lng,
    this.includeCoordinates = false,
    this.isDefault,
  });

  final String? label;
  final String? addressText;
  final int? cityId;
  final String? lat;
  final String? lng;
  final bool includeCoordinates;
  final bool? isDefault;

  Map<String, Object?> toJson() {
    if (includeCoordinates && ((lat == null) != (lng == null))) {
      throw const FormatException('Coordinates must be supplied as a pair');
    }
    if (!includeCoordinates && (lat != null || lng != null)) {
      throw const FormatException('Set includeCoordinates to send coordinates');
    }
    return {
      if (label != null) 'label': label,
      if (addressText != null) 'addressText': addressText,
      if (cityId != null) 'cityId': cityId,
      if (includeCoordinates) 'lat': lat,
      if (includeCoordinates) 'lng': lng,
      if (isDefault != null) 'isDefault': isDefault,
    };
  }
}

abstract interface class AddressGateway {
  Future<CatalogPage<CustomerAddress>> list({int page = 1, int limit = 20});

  Future<CustomerAddress> create({
    required String label,
    required String addressText,
    required int cityId,
    String? lat,
    String? lng,
    bool isDefault = false,
  });

  Future<CustomerAddress> update(String id, AddressDraft input);

  Future<void> delete(String id);
}

class AddressApi implements AddressGateway {
  AddressApi(this._client);

  final ApiClient _client;

  @override
  Future<CatalogPage<CustomerAddress>> list({
    int page = 1,
    int limit = 20,
  }) async => CatalogPage.fromJson(
    _data(
      await _client.get<JsonObject>(
        '/api/v1/addresses',
        query: {'page': page, 'limit': limit},
        authenticated: true,
      ),
    ),
    CustomerAddress.fromJson,
  );

  @override
  Future<CustomerAddress> create({
    required String label,
    required String addressText,
    required int cityId,
    String? lat,
    String? lng,
    bool isDefault = false,
  }) async {
    final input = AddressDraft(
      label: label,
      addressText: addressText,
      cityId: cityId,
      lat: lat,
      lng: lng,
      includeCoordinates: lat != null || lng != null,
      isDefault: isDefault,
    );
    final body = await _client.post<JsonObject>(
      '/api/v1/addresses',
      data: input.toJson(),
      authenticated: true,
    );
    return CustomerAddress.fromJson(_data(body));
  }

  @override
  Future<CustomerAddress> update(String id, AddressDraft input) async {
    final data = input.toJson();
    if (data.isEmpty) throw const FormatException('Address update is empty');
    final body = await _client.patch<JsonObject>(
      '/api/v1/addresses/$id',
      data: data,
      authenticated: true,
    );
    return CustomerAddress.fromJson(_data(body));
  }

  @override
  Future<void> delete(String id) =>
      _client.delete<Object?>('/api/v1/addresses/$id', authenticated: true);
}

JsonObject _data(JsonObject envelope) {
  final value = envelope['data'];
  if (value is! Map) throw const FormatException('Invalid API response');
  return value.cast<String, Object?>();
}
