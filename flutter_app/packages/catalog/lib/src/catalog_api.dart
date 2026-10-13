import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

enum ExpertSort {
  nameAsc('name_asc'),
  nameDesc('name_desc'),
  ratingDesc('rating_desc'),
  priceAsc('price_asc'),
  priceDesc('price_desc');

  const ExpertSort(this.wireValue);

  final String wireValue;

  bool get requiresService => this == priceAsc || this == priceDesc;
}

abstract interface class CatalogGateway {
  Future<PublicMapConfiguration> mapConfiguration();

  Future<List<CatalogCity>> cities();

  Future<CatalogPage<CatalogService>> services({int page = 1, int limit = 20});

  Future<CatalogPage<PublicExpert>> experts({
    int page = 1,
    int limit = 20,
    int? cityId,
    int? serviceId,
    String? q,
    ExpertSort sort = ExpertSort.nameAsc,
  });

  Future<ExpertDetail> expert(String id);

  Future<List<PortfolioItem>> portfolio(
    String expertId, {
    bool authenticated = false,
  });

  Future<CatalogPage<PublicReview>> reviews(
    String expertId, {
    int page = 1,
    int limit = 20,
  });

  Future<List<int>> portfolioBytes(
    String relativeUrl, {
    bool authenticated = false,
  });
}

class CatalogApi implements CatalogGateway {
  CatalogApi(this._client);

  final ApiClient _client;

  @override
  Future<PublicMapConfiguration> mapConfiguration() async {
    final data = _data(await _client.get<JsonObject>('/api/v1/configuration'));
    return PublicMapConfiguration.fromJson(_json(data['map']));
  }

  @override
  Future<List<CatalogCity>> cities() async {
    final data = _listData(await _client.get<JsonObject>('/api/v1/cities'));
    return data
        .map((item) => CatalogCity.fromJson(_json(item)))
        .toList(growable: false);
  }

  @override
  Future<CatalogPage<CatalogService>> services({
    int page = 1,
    int limit = 20,
  }) async => CatalogPage.fromJson(
    _data(
      await _client.get<JsonObject>(
        '/api/v1/services',
        query: {'page': page, 'limit': limit},
      ),
    ),
    CatalogService.fromJson,
  );

  @override
  Future<CatalogPage<PublicExpert>> experts({
    int page = 1,
    int limit = 20,
    int? cityId,
    int? serviceId,
    String? q,
    ExpertSort sort = ExpertSort.nameAsc,
  }) async {
    if (sort.requiresService && serviceId == null) {
      throw ArgumentError.value(
        sort,
        'sort',
        'Price sorting requires serviceId',
      );
    }
    return CatalogPage.fromJson(
      _data(
        await _client.get<JsonObject>(
          '/api/v1/experts',
          query: {
            'page': page,
            'limit': limit,
            'cityId': ?cityId,
            'serviceId': ?serviceId,
            'q': ?q,
            'sort': sort.wireValue,
          },
        ),
      ),
      PublicExpert.fromJson,
    );
  }

  @override
  Future<ExpertDetail> expert(String id) async => ExpertDetail.fromJson(
    _data(await _client.get<JsonObject>('/api/v1/experts/$id')),
  );

  @override
  Future<List<PortfolioItem>> portfolio(
    String expertId, {
    bool authenticated = false,
  }) async {
    final data = _listData(
      await _client.get<JsonObject>(
        '/api/v1/experts/$expertId/portfolio',
        authenticated: authenticated,
      ),
    );
    return data
        .map((item) => PortfolioItem.fromJson(_json(item)))
        .toList(growable: false);
  }

  @override
  Future<CatalogPage<PublicReview>> reviews(
    String expertId, {
    int page = 1,
    int limit = 20,
  }) async => CatalogPage.fromJson(
    _data(
      await _client.get<JsonObject>(
        '/api/v1/experts/$expertId/reviews',
        query: {'page': page, 'limit': limit},
      ),
    ),
    PublicReview.fromJson,
  );

  @override
  Future<List<int>> portfolioBytes(
    String relativeUrl, {
    bool authenticated = false,
  }) {
    _checkRelativeUrl(relativeUrl);
    return _client.getBytes(relativeUrl, authenticated: authenticated);
  }
}

JsonObject _data(JsonObject envelope) => _json(envelope['data']);

List<Object?> _listData(JsonObject envelope) {
  final value = envelope['data'];
  if (value is! List<Object?>) {
    throw const FormatException('Invalid API response');
  }
  return value;
}

JsonObject _json(Object? value) {
  if (value is! Map) throw const FormatException('Invalid API response');
  try {
    return value.cast<String, Object?>();
  } on TypeError {
    throw const FormatException('Invalid API response');
  }
}

void _checkRelativeUrl(String value) {
  final uri = Uri.tryParse(value);
  if (uri == null ||
      uri.hasScheme ||
      uri.hasAuthority ||
      !value.startsWith('/')) {
    throw ArgumentError.value(
      value,
      'relativeUrl',
      'Must be a relative API URL',
    );
  }
}
