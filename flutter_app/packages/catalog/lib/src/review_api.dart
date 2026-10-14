import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

/// A review of one booking party by the other. Reviews open only after the
/// booking completes, once per reviewer per booking, enforced server-side.
class BookingReview {
  const BookingReview({
    required this.id,
    required this.bookingId,
    required this.rating,
    required this.createdAt,
    this.reviewerId,
    this.revieweeId,
    this.comment,
    this.fromCustomer,
  });

  final String id;
  final String bookingId;
  final int rating;
  final String createdAt;
  final String? reviewerId;
  final String? revieweeId;
  final String? comment;
  final bool? fromCustomer;

  /// True for the review the current viewer wrote. The public list carries
  /// no account ids by design, so role-relative `fromCustomer` decides,
  /// falling back to id comparison when ids are present.
  bool isMine({required bool viewerIsCustomer, String? viewerId}) {
    if (viewerId != null && reviewerId != null) {
      return reviewerId == viewerId;
    }
    if (fromCustomer != null) {
      return viewerIsCustomer ? fromCustomer! : !fromCustomer!;
    }
    return false;
  }

  factory BookingReview.fromJson(JsonObject json) {
    int requiredInt(String key) {
      final value = json[key];
      if (value is! int) throw const FormatException('Invalid API response');
      return value;
    }

    String requiredString(String key) {
      final value = json[key];
      if (value is! String) {
        throw const FormatException('Invalid API response');
      }
      return value;
    }

    final fromCustomer = json['fromCustomer'];
    return BookingReview(
      id: requiredString('id'),
      bookingId: (json['bookingId'] as String?) ?? '',
      rating: requiredInt('rating'),
      createdAt: requiredString('createdAt'),
      reviewerId: json['reviewerId'] as String?,
      revieweeId: json['revieweeId'] as String?,
      comment: json['comment'] as String?,
      fromCustomer: fromCustomer is bool ? fromCustomer : null,
    );
  }
}

abstract interface class ReviewGateway {
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  });
  Future<List<BookingReview>> forBooking(String bookingId);
}

class ReviewApi implements ReviewGateway {
  ReviewApi(this._client);

  final ApiClient _client;

  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/bookings/$bookingId/reviews',
      data: {
        'rating': rating,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
      },
      authenticated: true,
    );
    final data = body['data'];
    // The service returns { review, rating, revieweeId }; the review row is
    // the durable fact the apps display.
    final review = data is JsonObject ? data['review'] : null;
    if (review is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return BookingReview.fromJson(review);
  }

  @override
  Future<List<BookingReview>> forBooking(String bookingId) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/bookings/$bookingId/reviews',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return data
        .whereType<JsonObject>()
        .map(BookingReview.fromJson)
        .toList(growable: false);
  }
}
