import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

/// A per-currency money total. Amounts stay decimal strings; the apps never
/// sum, convert, or round them.
class MoneyTotal {
  const MoneyTotal({required this.currency, required this.amount});

  final String currency;
  final String amount;

  factory MoneyTotal.fromJson(JsonObject json) {
    final currency = json['currency'];
    final amount = json['amount'];
    if (currency is! String || amount is! String) {
      throw const FormatException('Invalid API response');
    }
    return MoneyTotal(currency: currency, amount: amount);
  }
}

/// Server-computed earnings split: eligible now, recorded, transferred.
class EarningsSummary {
  const EarningsSummary({
    required this.eligible,
    required this.recorded,
    required this.transferred,
  });

  final List<MoneyTotal> eligible;
  final List<MoneyTotal> recorded;
  final List<MoneyTotal> transferred;

  static List<MoneyTotal> _totals(JsonObject json, String key) {
    final raw = json[key];
    if (raw is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return raw
        .whereType<JsonObject>()
        .map(MoneyTotal.fromJson)
        .toList(growable: false);
  }

  factory EarningsSummary.fromJson(JsonObject json) => EarningsSummary(
    eligible: _totals(json, 'eligible'),
    recorded: _totals(json, 'recorded'),
    transferred: _totals(json, 'transferred'),
  );
}

class ExpertPayout {
  const ExpertPayout({
    required this.id,
    required this.amount,
    required this.currency,
    required this.transferRef,
    required this.transferredAt,
    required this.createdAt,
    this.bookings = const [],
  });

  final String id;
  final String amount;
  final String currency;
  final String? transferRef;
  final String? transferredAt;
  final String createdAt;
  final List<PayoutBooking> bookings;

  bool get isTransferred => transferredAt != null;

  factory ExpertPayout.fromJson(JsonObject json) {
    String requiredString(String key) {
      final value = json[key];
      if (value is! String) {
        throw const FormatException('Invalid API response');
      }
      return value;
    }

    final rawBookings = json['bookings'];
    final bookings = rawBookings is List<Object?>
        ? rawBookings
              .whereType<JsonObject>()
              .map(PayoutBooking.fromJson)
              .toList(growable: false)
        : const <PayoutBooking>[];
    return ExpertPayout(
      id: requiredString('id'),
      amount: requiredString('amount'),
      currency: requiredString('currency'),
      transferRef: json['transferRef'] as String?,
      transferredAt: json['transferredAt'] as String?,
      createdAt: requiredString('createdAt'),
      bookings: bookings,
    );
  }
}

class PayoutBooking {
  const PayoutBooking({
    required this.id,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.timeZone,
    required this.totalAmount,
    required this.expertEarning,
    required this.currency,
  });

  final String id;
  final String status;
  final String startsAt;
  final String endsAt;
  final String timeZone;
  final String totalAmount;
  final String expertEarning;
  final String currency;

  factory PayoutBooking.fromJson(JsonObject json) {
    String requiredString(String key) {
      final value = json[key];
      if (value is! String) {
        throw const FormatException('Invalid API response');
      }
      return value;
    }

    return PayoutBooking(
      id: requiredString('id'),
      status: requiredString('status'),
      startsAt: json['startsAt'].toString(),
      endsAt: json['endsAt'].toString(),
      timeZone: requiredString('timeZone'),
      totalAmount: requiredString('totalAmount'),
      expertEarning: requiredString('expertEarning'),
      currency: requiredString('currency'),
    );
  }
}

abstract interface class EarningGateway {
  Future<EarningsSummary> earnings();
  Future<CatalogPage<ExpertPayout>> payouts({bool? transferred, int page = 1});
  Future<ExpertPayout> payout(String id);
}

class EarningApi implements EarningGateway {
  EarningApi(this._client);

  final ApiClient _client;

  @override
  Future<EarningsSummary> earnings() async {
    final body = await _client.get<JsonObject>(
      '/api/v1/experts/me/earnings',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return EarningsSummary.fromJson(data);
  }

  @override
  Future<CatalogPage<ExpertPayout>> payouts({
    bool? transferred,
    int page = 1,
  }) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/experts/me/payouts',
      query: {'page': page, 'transferred': ?transferred},
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return CatalogPage.fromJson(data, ExpertPayout.fromJson);
  }

  @override
  Future<ExpertPayout> payout(String id) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/experts/me/payouts/$id',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return ExpertPayout.fromJson(data);
  }
}
