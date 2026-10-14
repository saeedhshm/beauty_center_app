import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:test/test.dart';

void main() {
  Map<String, Object?> reviewJson() => {
    'id': 'r1',
    'bookingId': 'b1',
    'reviewerId': 'c1',
    'revieweeId': 'e1',
    'rating': 5,
    'comment': 'ممتازة',
    'createdAt': '2026-10-21T08:00:00.000Z',
  };

  test('review keeps rating and nullable comment', () {
    final review = BookingReview.fromJson(reviewJson());
    expect(review.rating, 5);
    expect(review.comment, 'ممتازة');
  });

  test('ratings stay inside 1..5 at the DTO boundary', () {
    for (final rating in [1, 2, 3, 4, 5]) {
      final review = BookingReview.fromJson(reviewJson()..['rating'] = rating);
      expect(review.rating, rating);
    }
    expect(
      () => BookingReview.fromJson(reviewJson()..['rating'] = 'high'),
      throwsFormatException,
    );
  });
}
