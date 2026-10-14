import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

/// Booking lifecycle states. `paid` is a payment state, never a booking one.
class BookingStates {
  static const pending = 'pending';
  static const accepted = 'accepted';
  static const confirmed = 'confirmed';
  static const completed = 'completed';
  static const rejected = 'rejected';
  static const cancelled = 'cancelled';
  static const expired = 'expired';
}

class BookingStatusEntry {
  const BookingStatusEntry({
    required this.status,
    required this.changedAt,
    this.changedBy,
  });

  final String status;
  final String changedAt;
  final String? changedBy;

  factory BookingStatusEntry.fromJson(JsonObject json) {
    final created = json['createdAt'] ?? json['changedAt'];
    final status = json['status'];
    if (created is! String || status is! String) {
      throw const FormatException('Invalid API response');
    }
    return BookingStatusEntry(
      status: status,
      changedAt: created,
      changedBy: json['changedBy'] as String?,
    );
  }
}

/// A booking snapshot. Every amount, deadline, and state comes from the
/// server; the apps never compute them.
class Booking {
  const Booking({
    required this.id,
    required this.customerId,
    required this.expertId,
    required this.serviceId,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.timeZone,
    required this.expiresAt,
    required this.addressText,
    required this.cityId,
    required this.price,
    required this.commissionRate,
    required this.commissionAmount,
    required this.expertEarning,
    required this.vatRate,
    required this.vatAmount,
    required this.totalAmount,
    required this.currency,
    required this.notes,
    required this.cancellationReason,
    required this.cancelledAt,
    required this.createdAt,
    required this.updatedAt,
    this.statusHistory = const [],
  });

  final String id;
  final String customerId;
  final String expertId;
  final int serviceId;
  final String status;
  final String startsAt;
  final String endsAt;
  final String timeZone;
  final String? expiresAt;
  final String addressText;
  final int cityId;
  final String price;
  final String commissionRate;
  final String commissionAmount;
  final String expertEarning;
  final String vatRate;
  final String vatAmount;
  final String totalAmount;
  final String currency;
  final String? notes;
  final String? cancellationReason;
  final String? cancelledAt;
  final String createdAt;
  final String updatedAt;
  final List<BookingStatusEntry> statusHistory;

  static String _string(JsonObject json, String key) {
    final value = json[key];
    if (value is! String) throw const FormatException('Invalid API response');
    return value;
  }

  static int _integer(JsonObject json, String key) {
    final value = json[key];
    if (value is! int) throw const FormatException('Invalid API response');
    return value;
  }

  static String? _optionalString(JsonObject json, String key) {
    final value = json[key];
    if (value == null) return null;
    if (value is! String) throw const FormatException('Invalid API response');
    return value;
  }

  factory Booking.fromJson(JsonObject json) {
    final rawHistory = json['statusHistory'];
    final history = rawHistory is List<Object?>
        ? rawHistory
              .whereType<JsonObject>()
              .map(BookingStatusEntry.fromJson)
              .toList(growable: false)
        : const <BookingStatusEntry>[];
    return Booking(
      id: _string(json, 'id'),
      customerId: _string(json, 'customerId'),
      expertId: _string(json, 'expertId'),
      serviceId: _integer(json, 'serviceId'),
      status: _string(json, 'status'),
      startsAt: _string(json, 'startsAt'),
      endsAt: _string(json, 'endsAt'),
      timeZone: _string(json, 'timeZone'),
      expiresAt: _optionalString(json, 'expiresAt'),
      addressText: _string(json, 'addressText'),
      cityId: _integer(json, 'cityId'),
      price: _string(json, 'price'),
      commissionRate: _string(json, 'commissionRate'),
      commissionAmount: _string(json, 'commissionAmount'),
      expertEarning: _string(json, 'expertEarning'),
      vatRate: _string(json, 'vatRate'),
      vatAmount: _string(json, 'vatAmount'),
      totalAmount: _string(json, 'totalAmount'),
      currency: _string(json, 'currency'),
      notes: _optionalString(json, 'notes'),
      cancellationReason: _optionalString(json, 'cancellationReason'),
      cancelledAt: _optionalString(json, 'cancelledAt'),
      createdAt: _string(json, 'createdAt'),
      updatedAt: _string(json, 'updatedAt'),
      statusHistory: history,
    );
  }

  bool get isPending => status == BookingStates.pending;
  bool get isAccepted => status == BookingStates.accepted;
}

abstract interface class BookingGateway {
  Future<Booking> createBooking({
    required String expertId,
    required int serviceId,
    required String addressId,
    required String startsAt,
    String? notes,
    required String idempotencyKey,
  });
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1});
  Future<Booking> booking(String id);
  Future<Booking> accept(String id);
  Future<Booking> reject(String id, {String? reason});
  Future<Booking> cancel(String id, {String? reason});
  Future<Booking> complete(String id);
}

class BookingApi implements BookingGateway {
  BookingApi(this._client);

  final ApiClient _client;

  Booking _booking(Object? data) {
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return Booking.fromJson(data);
  }

  @override
  Future<Booking> createBooking({
    required String expertId,
    required int serviceId,
    required String addressId,
    required String startsAt,
    String? notes,
    required String idempotencyKey,
  }) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/bookings',
      data: {
        'expertId': expertId,
        'serviceId': serviceId,
        'addressId': addressId,
        'startsAt': startsAt,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      headers: {'Idempotency-Key': idempotencyKey},
      authenticated: true,
    );
    return _booking(body['data']);
  }

  @override
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/bookings',
      query: {'page': page, 'status': ?status},
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return CatalogPage.fromJson(data, Booking.fromJson);
  }

  @override
  Future<Booking> booking(String id) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/bookings/$id',
      authenticated: true,
    );
    return _booking(body['data']);
  }

  @override
  Future<Booking> accept(String id) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/bookings/$id/accept',
      authenticated: true,
    );
    return _booking(body['data']);
  }

  @override
  Future<Booking> reject(String id, {String? reason}) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/bookings/$id/reject',
      data: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      authenticated: true,
    );
    return _booking(body['data']);
  }

  @override
  Future<Booking> cancel(String id, {String? reason}) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/bookings/$id/cancel',
      data: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      authenticated: true,
    );
    return _booking(body['data']);
  }

  @override
  Future<Booking> complete(String id) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/bookings/$id/complete',
      authenticated: true,
    );
    return _booking(body['data']);
  }
}
