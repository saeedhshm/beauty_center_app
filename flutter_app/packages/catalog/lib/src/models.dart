typedef JsonObject = Map<String, Object?>;

class CatalogPage<T> {
  const CatalogPage({
    required this.items,
    required this.page,
    required this.limit,
    required this.hasNext,
  });

  factory CatalogPage.fromJson(
    JsonObject json,
    T Function(JsonObject json) itemFromJson,
  ) {
    final pagination = _object(json, 'pagination');
    final rawItems = _value<List<Object?>>(json, 'items');
    return CatalogPage(
      items: rawItems
          .map((item) => itemFromJson(_asObject(item, 'items')))
          .toList(growable: false),
      page: _value<int>(pagination, 'page'),
      limit: _value<int>(pagination, 'limit'),
      hasNext: _value<bool>(pagination, 'hasNext'),
    );
  }

  final List<T> items;
  final int page;
  final int limit;
  final bool hasNext;
}

class CatalogCity {
  const CatalogCity({
    required this.id,
    required this.name,
    required this.code,
    required this.isActive,
    this.location = const CityLocation.notConfigured(),
  });

  factory CatalogCity.fromJson(JsonObject json) => CatalogCity(
    id: _value<int>(json, 'id'),
    name: _value<String>(json, 'name'),
    code: _nullable<String>(json, 'code'),
    isActive: _value<bool>(json, 'isActive'),
    location: json.containsKey('location')
        ? CityLocation.fromJson(_object(json, 'location'))
        : const CityLocation.notConfigured(),
  );

  final int id;
  final String name;
  final String? code;
  final bool isActive;
  final CityLocation location;
}

enum CityLocationStatus { ready, notConfigured }

class CityLocation {
  const CityLocation.ready(this.bounds) : status = CityLocationStatus.ready;

  const CityLocation.notConfigured()
    : status = CityLocationStatus.notConfigured,
      bounds = null;

  factory CityLocation.fromJson(JsonObject json) {
    return switch (_value<String>(json, 'status')) {
      'ready' => CityLocation.ready(
        MapBounds.fromJson(_object(json, 'bounds')),
      ),
      'not_configured' => const CityLocation.notConfigured(),
      _ => throw const FormatException('Invalid location status'),
    };
  }

  final CityLocationStatus status;
  final MapBounds? bounds;
}

class MapBounds {
  const MapBounds({
    required this.south,
    required this.west,
    required this.north,
    required this.east,
  }) : assert(south >= -90 && south < north && north <= 90),
       assert(west >= -180 && west < east && east <= 180);

  factory MapBounds.fromJson(JsonObject json) {
    final south = _decimal(json, 'south');
    final west = _decimal(json, 'west');
    final north = _decimal(json, 'north');
    final east = _decimal(json, 'east');
    if (south < -90 || south >= north || north > 90) {
      throw const FormatException('Invalid latitude bounds');
    }
    if (west < -180 || west >= east || east > 180) {
      throw const FormatException('Invalid longitude bounds');
    }
    return MapBounds(south: south, west: west, north: north, east: east);
  }

  final double south;
  final double west;
  final double north;
  final double east;

  bool contains(double latitude, double longitude) =>
      latitude >= south &&
      latitude <= north &&
      longitude >= west &&
      longitude <= east;
}

class PublicMapConfiguration {
  const PublicMapConfiguration({
    required this.tileUrlTemplate,
    required this.minZoom,
    required this.maxZoom,
    required this.attributionUrl,
    required this.reportIssueUrl,
  });

  factory PublicMapConfiguration.fromJson(JsonObject json) {
    if (_value<String>(json, 'type') != 'raster') {
      throw const FormatException('Unsupported map type');
    }
    final tileUrlTemplate = _value<String>(json, 'tileUrlTemplate');
    final minZoom = _value<int>(json, 'minZoom');
    final maxZoom = _value<int>(json, 'maxZoom');
    final attribution = _object(json, 'attribution');
    final attributionUrl = Uri.tryParse(_value<String>(attribution, 'url'));
    final reportIssueUrl = Uri.tryParse(_value<String>(json, 'reportIssueUrl'));
    if (!tileUrlTemplate.startsWith('https://') ||
        !tileUrlTemplate.contains('{z}') ||
        !tileUrlTemplate.contains('{x}') ||
        !tileUrlTemplate.contains('{y}') ||
        minZoom < 0 ||
        minZoom >= maxZoom ||
        maxZoom > 24 ||
        attributionUrl?.scheme != 'https' ||
        reportIssueUrl?.scheme != 'https') {
      throw const FormatException('Invalid map configuration');
    }
    return PublicMapConfiguration(
      tileUrlTemplate: tileUrlTemplate,
      minZoom: minZoom,
      maxZoom: maxZoom,
      attributionUrl: attributionUrl!,
      reportIssueUrl: reportIssueUrl!,
    );
  }

  final String tileUrlTemplate;
  final int minZoom;
  final int maxZoom;
  final Uri attributionUrl;
  final Uri reportIssueUrl;
}

class CatalogService {
  const CatalogService({
    required this.id,
    required this.name,
    required this.description,
    required this.durationMin,
    required this.isActive,
  });

  factory CatalogService.fromJson(JsonObject json) => CatalogService(
    id: _value<int>(json, 'id'),
    name: _value<String>(json, 'name'),
    description: _nullable<String>(json, 'description'),
    durationMin: _value<int>(json, 'durationMin'),
    isActive: _value<bool>(json, 'isActive'),
  );

  final int id;
  final String name;
  final String? description;
  final int durationMin;
  final bool isActive;
}

class PublicExpert {
  const PublicExpert({
    required this.id,
    required this.name,
    required this.cityId,
    required this.cityName,
    required this.bio,
    required this.ratingAvg,
    required this.ratingCount,
  });

  factory PublicExpert.fromJson(JsonObject json) => PublicExpert(
    id: _value<String>(json, 'id'),
    name: _value<String>(json, 'name'),
    cityId: _nullable<int>(json, 'cityId'),
    cityName: _nullable<String>(json, 'cityName'),
    bio: _nullable<String>(json, 'bio'),
    ratingAvg: _value<String>(json, 'ratingAvg'),
    ratingCount: _value<int>(json, 'ratingCount'),
  );

  final String id;
  final String name;
  final int? cityId;
  final String? cityName;
  final String? bio;
  final String ratingAvg;
  final int ratingCount;
}

class ExpertOffering {
  const ExpertOffering({
    required this.serviceId,
    required this.name,
    required this.description,
    required this.durationMin,
    required this.price,
    required this.currency,
    required this.isActive,
    required this.serviceIsActive,
  });

  factory ExpertOffering.fromJson(JsonObject json) => ExpertOffering(
    serviceId: _value<int>(json, 'serviceId'),
    name: _value<String>(json, 'name'),
    description: _nullable<String>(json, 'description'),
    durationMin: _value<int>(json, 'durationMin'),
    price: _value<String>(json, 'price'),
    currency: _value<String>(json, 'currency'),
    isActive: _value<bool>(json, 'isActive'),
    serviceIsActive: _value<bool>(json, 'serviceIsActive'),
  );

  final int serviceId;
  final String name;
  final String? description;
  final int durationMin;
  final String price;
  final String currency;
  final bool isActive;
  final bool serviceIsActive;
}

class ExpertDetail {
  const ExpertDetail({
    required this.id,
    required this.name,
    required this.cityId,
    required this.cityName,
    required this.bio,
    required this.ratingAvg,
    required this.ratingCount,
    required this.services,
  });

  factory ExpertDetail.fromJson(JsonObject json) => ExpertDetail(
    id: _value<String>(json, 'id'),
    name: _value<String>(json, 'name'),
    cityId: _nullable<int>(json, 'cityId'),
    cityName: _nullable<String>(json, 'cityName'),
    bio: _nullable<String>(json, 'bio'),
    ratingAvg: _value<String>(json, 'ratingAvg'),
    ratingCount: _value<int>(json, 'ratingCount'),
    services: _value<List<Object?>>(json, 'services')
        .map((item) => ExpertOffering.fromJson(_asObject(item, 'services')))
        .toList(growable: false),
  );

  final String id;
  final String name;
  final int? cityId;
  final String? cityName;
  final String? bio;
  final String ratingAvg;
  final int ratingCount;
  final List<ExpertOffering> services;
}

class PortfolioItem {
  const PortfolioItem({
    required this.id,
    required this.serviceId,
    required this.sortOrder,
    required this.url,
  });

  factory PortfolioItem.fromJson(JsonObject json) => PortfolioItem(
    id: _value<String>(json, 'id'),
    serviceId: _nullable<int>(json, 'serviceId'),
    sortOrder: _value<int>(json, 'sortOrder'),
    url: _value<String>(json, 'url'),
  );

  final String id;
  final int? serviceId;
  final int sortOrder;
  final String url;
}

class PublicReview {
  const PublicReview({
    required this.id,
    required this.rating,
    required this.comment,
    required this.serviceName,
    required this.reviewerName,
    required this.fromCustomer,
    required this.createdAt,
  });

  factory PublicReview.fromJson(JsonObject json) => PublicReview(
    id: _value<String>(json, 'id'),
    rating: _value<int>(json, 'rating'),
    comment: _nullable<String>(json, 'comment'),
    serviceName: _nullable<String>(json, 'serviceName'),
    reviewerName: _value<String>(json, 'reviewerName'),
    fromCustomer: _value<bool>(json, 'fromCustomer'),
    createdAt: DateTime.parse(_value<String>(json, 'createdAt')),
  );

  final String id;
  final int rating;
  final String? comment;
  final String? serviceName;
  final String reviewerName;
  final bool fromCustomer;
  final DateTime createdAt;
}

class CustomerAddress {
  const CustomerAddress({
    required this.id,
    required this.label,
    required this.addressText,
    required this.cityId,
    required this.lat,
    required this.lng,
    required this.isDefault,
  });

  factory CustomerAddress.fromJson(JsonObject json) => CustomerAddress(
    id: _value<String>(json, 'id'),
    label: _value<String>(json, 'label'),
    addressText: _value<String>(json, 'addressText'),
    cityId: _value<int>(json, 'cityId'),
    lat: _nullable<String>(json, 'lat'),
    lng: _nullable<String>(json, 'lng'),
    isDefault: _value<bool>(json, 'isDefault'),
  );

  final String id;
  final String label;
  final String addressText;
  final int cityId;
  final String? lat;
  final String? lng;
  final bool isDefault;
}

class ExpertService {
  const ExpertService({
    required this.expertId,
    required this.serviceId,
    required this.name,
    required this.description,
    required this.durationMin,
    required this.price,
    required this.currency,
    required this.isActive,
    required this.serviceIsActive,
  });

  factory ExpertService.fromJson(JsonObject json) => ExpertService(
    expertId: _optional<String>(json, 'expertId'),
    serviceId: _value<int>(json, 'serviceId'),
    name: _optional<String>(json, 'name'),
    description: _optional<String>(json, 'description'),
    durationMin: _optional<int>(json, 'durationMin'),
    price: _value<String>(json, 'price'),
    currency: _value<String>(json, 'currency'),
    isActive: _value<bool>(json, 'isActive'),
    serviceIsActive: _optional<bool>(json, 'serviceIsActive'),
  );

  final String? expertId;
  final int serviceId;
  final String? name;
  final String? description;
  final int? durationMin;
  final String price;
  final String currency;
  final bool isActive;
  final bool? serviceIsActive;
}

T _value<T>(JsonObject json, String key) {
  final value = json[key];
  if (value is! T) throw FormatException('Invalid $key');
  return value;
}

T? _nullable<T>(JsonObject json, String key) {
  if (!json.containsKey(key)) throw FormatException('Missing $key');
  final value = json[key];
  if (value == null) return null;
  if (value is! T) throw FormatException('Invalid $key');
  return value as T;
}

T? _optional<T>(JsonObject json, String key) {
  final value = json[key];
  if (value == null) return null;
  if (value is! T) throw FormatException('Invalid $key');
  return value as T;
}

double _decimal(JsonObject json, String key) {
  final value = json[key];
  if (value is! String) throw FormatException('Invalid $key');
  final number = double.tryParse(value);
  if (number == null || !number.isFinite) throw FormatException('Invalid $key');
  return number;
}

JsonObject _object(JsonObject json, String key) => _asObject(json[key], key);

JsonObject _asObject(Object? value, String key) {
  if (value is! Map) throw FormatException('Invalid $key');
  try {
    return value.cast<String, Object?>();
  } on TypeError {
    throw FormatException('Invalid $key');
  }
}
