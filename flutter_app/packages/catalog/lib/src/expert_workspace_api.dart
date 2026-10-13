import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

abstract interface class ExpertWorkspaceGateway {
  Future<List<ExpertService>> services();

  Future<ExpertService> upsertService({
    required int serviceId,
    required String price,
    required bool isActive,
  });

  Future<List<PortfolioItem>> portfolio(String expertId);

  Future<PortfolioItem> uploadPortfolio({
    required List<int> bytes,
    required String filename,
    required String contentType,
    int? serviceId,
  });

  Future<void> deletePortfolio(String id);

  Future<List<int>> portfolioBytes(String relativeUrl);
}

class ExpertWorkspaceApi implements ExpertWorkspaceGateway {
  ExpertWorkspaceApi(this._client);

  final ApiClient _client;

  @override
  Future<List<ExpertService>> services() async {
    final body = await _client.get<JsonObject>(
      '/api/v1/experts/me/services',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return data
        .map((item) => ExpertService.fromJson(_json(item)))
        .toList(growable: false);
  }

  @override
  Future<ExpertService> upsertService({
    required int serviceId,
    required String price,
    required bool isActive,
  }) async {
    final body = await _client.put<JsonObject>(
      '/api/v1/experts/me/services/$serviceId',
      data: {'price': price, 'isActive': isActive},
      authenticated: true,
    );
    return ExpertService.fromJson(_data(body));
  }

  @override
  Future<List<PortfolioItem>> portfolio(String expertId) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/experts/$expertId/portfolio',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return data
        .map((item) => PortfolioItem.fromJson(_json(item)))
        .toList(growable: false);
  }

  @override
  Future<PortfolioItem> uploadPortfolio({
    required List<int> bytes,
    required String filename,
    required String contentType,
    int? serviceId,
  }) async {
    final body = await _client.uploadBytes<JsonObject>(
      '/api/v1/experts/me/portfolio',
      fieldName: 'image',
      bytes: bytes,
      filename: filename,
      contentType: contentType,
      fields: {'serviceId': ?serviceId},
      authenticated: true,
    );
    return PortfolioItem.fromJson(_data(body));
  }

  @override
  Future<void> deletePortfolio(String id) => _client.delete<Object?>(
    '/api/v1/experts/me/portfolio/$id',
    authenticated: true,
  );

  @override
  Future<List<int>> portfolioBytes(String relativeUrl) {
    final uri = Uri.tryParse(relativeUrl);
    if (uri == null ||
        uri.hasScheme ||
        uri.hasAuthority ||
        !relativeUrl.startsWith('/')) {
      throw ArgumentError.value(
        relativeUrl,
        'relativeUrl',
        'Must be a relative API URL',
      );
    }
    return _client.getBytes(relativeUrl, authenticated: true);
  }
}

JsonObject _data(JsonObject envelope) => _json(envelope['data']);

JsonObject _json(Object? value) {
  if (value is! Map) throw const FormatException('Invalid API response');
  return value.cast<String, Object?>();
}
