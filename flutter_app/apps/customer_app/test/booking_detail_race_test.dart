import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/bookings_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Request-race guards for the booking detail screen.
///
/// Every read goes through a generation counter, so a slower older reply is
/// discarded instead of overwriting a newer one, and a refused booking read
/// removes the snapshot that would otherwise keep pay/cancel/complete usable.
/// Auxiliary sections (attempts, reviews) fail on their own and are marked as
/// not refreshed rather than rendered as a confirmed empty list.
void main() {
  Future<void> pumpDetail(
    WidgetTester tester,
    _DetailGateway gateway, {
    String id = 'b1',
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        theme: LamsaTheme.light(),
        home: Scaffold(
          body: BookingDetailScreen(
            bookings: gateway,
            payments: gateway,
            reviews: gateway,
            currentUserId: 'c1',
            bookingId: id,
          ),
        ),
      ),
    );
  }

  testWidgets('the newest booking response wins over a slower older one', (
    tester,
  ) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'accepted');

    // First read stays gated.
    gateway.bookingGates['b1'] = Queue.of([Completer<Booking>()]);
    await pumpDetail(tester, gateway);
    await tester.pump();

    // A resume triggers a newer read that resolves immediately.
    gateway.bookingResults['b1'] = bookingFixture('b1', 'confirmed');
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('مؤكد'), findsWidgets);

    // The older reply lands last and must not restore "accepted".
    gateway.consumedBookingGates['b1']!.first.complete(
      bookingFixture('b1', 'accepted'),
    );
    await tester.pumpAndSettle();

    expect(find.text('مؤكد'), findsWidgets);
    expect(find.text('مقبول'), findsNothing);
    expect(find.byKey(const ValueKey('booking-pay')), findsNothing);
    expect(find.byKey(const ValueKey('booking-complete')), findsOneWidget);
  });

  testWidgets('a stale error from an older load never replaces current data', (
    tester,
  ) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'accepted');

    gateway.bookingGates['b1'] = Queue.of([Completer<Booking>()]);
    await pumpDetail(tester, gateway);
    await tester.pump();

    gateway.bookingResults['b1'] = bookingFixture('b1', 'confirmed');
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('مؤكد'), findsWidgets);

    gateway.consumedBookingGates['b1']!.first.completeError(
      const ApiFailure(
        kind: ApiFailureKind.notFound,
        code: 'NOT_FOUND',
        message: 'gone',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('مؤكد'), findsWidgets);
    expect(find.text('إعادة المحاولة'), findsNothing);
  });

  testWidgets('a 404 after loaded data hides pay and cancel', (tester) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'accepted');
    await pumpDetail(tester, gateway);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('booking-pay')), findsOneWidget);
    expect(find.byKey(const ValueKey('booking-cancel')), findsOneWidget);

    gateway.bookingFailure = const ApiFailure(
      kind: ApiFailureKind.notFound,
      code: 'NOT_FOUND',
      message: 'gone',
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('booking-pay')), findsNothing);
    expect(find.byKey(const ValueKey('booking-cancel')), findsNothing);
    expect(find.byKey(const ValueKey('booking-complete')), findsNothing);
    expect(
      find.text('الحجز غير موجود أو لا تملكين صلاحية عرضه'),
      findsOneWidget,
    );

    // Recovery brings the actions back, refetched from the server.
    gateway.bookingFailure = null;
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('booking-pay')), findsOneWidget);
  });

  testWidgets('a 403 after loaded data hides every old action', (tester) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'confirmed');
    await pumpDetail(tester, gateway);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('booking-complete')), findsOneWidget);

    gateway.bookingFailure = const ApiFailure(
      kind: ApiFailureKind.forbidden,
      code: 'FORBIDDEN',
      message: 'denied',
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('booking-complete')), findsNothing);
    expect(find.text('غير مسموح'), findsOneWidget);
  });

  testWidgets('an expired session after loaded data hides every old action', (
    tester,
  ) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'confirmed');
    await pumpDetail(tester, gateway);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('booking-complete')), findsOneWidget);

    gateway.bookingFailure = const ApiFailure(
      kind: ApiFailureKind.unauthorized,
      code: 'UNAUTHENTICATED',
      message: 'expired',
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('booking-complete')), findsNothing);
    expect(find.text('انتهت الجلسة، سجلي الدخول مجددًا'), findsOneWidget);
  });

  testWidgets('failed attempts are not shown as an empty list', (tester) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'accepted');
    gateway.attemptsFailure = const ApiFailure(
      kind: ApiFailureKind.server,
      code: 'FAILED',
      message: 'boom',
    );
    await pumpDetail(tester, gateway);
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('payment-attempts-unavailable')),
      findsOneWidget,
    );
    expect(
      find.text('تعذّر تحميل محاولات الدفع. اسحبي للتحديث.'),
      findsOneWidget,
    );
    // The booking is still readable and payable: only the auxiliary list failed.
    expect(find.byKey(const ValueKey('booking-pay')), findsOneWidget);
  });

  testWidgets('a stale attempts list is kept but marked as not refreshed', (
    tester,
  ) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'accepted');
    gateway.attemptResults['b1'] = [_payment('p1', 'paid')];
    await pumpDetail(tester, gateway);
    await tester.pumpAndSettle();
    expect(find.textContaining('مدفوع'), findsOneWidget);

    gateway.attemptsFailure = const ApiFailure(
      kind: ApiFailureKind.server,
      code: 'FAILED',
      message: 'boom',
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('payment-attempts-stale')),
      findsOneWidget,
    );
    expect(find.textContaining('مدفوع'), findsOneWidget);
  });

  testWidgets('a stale attempts list never replaces a newer one', (
    tester,
  ) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'accepted');
    gateway.attemptResults['b1'] = [_payment('old', 'paid')];

    gateway.attemptGates['b1'] = Queue.of([Completer<List<BookingPayment>>()]);
    await pumpDetail(tester, gateway);
    await tester.pump();

    gateway.attemptResults['b1'] = [_payment('new', 'failed')];
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.textContaining('فشل'), findsOneWidget);

    gateway.consumedAttemptGates['b1']!.first.complete([
      _payment('old', 'paid'),
    ]);
    await tester.pumpAndSettle();

    expect(find.textContaining('مدفوع'), findsNothing);
    expect(find.textContaining('فشل'), findsOneWidget);
  });

  testWidgets('failed reviews never offer the form as if unreviewed', (
    tester,
  ) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'completed');
    gateway.reviewsFailure = const ApiFailure(
      kind: ApiFailureKind.server,
      code: 'FAILED',
      message: 'boom',
    );
    await pumpDetail(tester, gateway);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('reviews-unavailable')), findsOneWidget);
    expect(find.byKey(const ValueKey('review-submit')), findsNothing);
  });

  testWidgets('a stale reviews list never replaces a newer one', (
    tester,
  ) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'completed');
    gateway.reviewResults['b1'] = const [
      BookingReview(
        id: 'r-old',
        bookingId: 'b1',
        rating: 1,
        reviewerId: 'c1',
        createdAt: '2026-10-14T07:00:00.000Z',
      ),
    ];

    gateway.reviewGates['b1'] = Queue.of([Completer<List<BookingReview>>()]);
    await pumpDetail(tester, gateway);
    await tester.pump();

    gateway.reviewResults['b1'] = const [
      BookingReview(
        id: 'r-new',
        bookingId: 'b1',
        rating: 5,
        reviewerId: 'c1',
        createdAt: '2026-10-14T08:00:00.000Z',
      ),
    ];
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.textContaining('★★★★★'), findsOneWidget);

    gateway.consumedReviewGates['b1']!.first.complete(const [
      BookingReview(
        id: 'r-old',
        bookingId: 'b1',
        rating: 1,
        reviewerId: 'c1',
        createdAt: '2026-10-14T07:00:00.000Z',
      ),
    ]);
    await tester.pumpAndSettle();

    expect(find.textContaining('★☆☆☆☆'), findsNothing);
    expect(find.textContaining('★★★★★'), findsOneWidget);
  });

  testWidgets('a cancel refetches and a failed refetch drops the actions', (
    tester,
  ) async {
    final gateway = _DetailGateway();
    gateway.bookingResults['b1'] = bookingFixture('b1', 'accepted');
    await pumpDetail(tester, gateway);
    await tester.pumpAndSettle();

    gateway.cancelled = bookingFixture('b1', 'cancelled');
    await tester.ensureVisible(find.byKey(const ValueKey('booking-cancel')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('booking-cancel')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cancel-confirm')));
    await tester.pumpAndSettle();

    expect(gateway.cancelCalls, 1);
    expect(find.text('ملغي'), findsWidgets);
    expect(find.byKey(const ValueKey('booking-pay')), findsNothing);

    // The post-action refetch is refused: nothing stale stays actionable.
    gateway.bookingFailure = const ApiFailure(
      kind: ApiFailureKind.forbidden,
      code: 'FORBIDDEN',
      message: 'denied',
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('booking-cancel')), findsNothing);
    expect(find.text('غير مسموح'), findsOneWidget);
  });
}

BookingPayment _payment(String id, String status) => BookingPayment(
  id: id,
  bookingId: 'b1',
  amount: '300.50',
  currency: 'EGP',
  status: status,
  provider: 'demo',
  failureReason: null,
);

Booking bookingFixture(String id, String status) => Booking(
  id: id,
  customerId: 'c1',
  expertId: 'e1',
  serviceId: 7,
  status: status,
  startsAt: '2026-10-20T07:00:00.000Z',
  endsAt: '2026-10-20T08:00:00.000Z',
  timeZone: 'Africa/Cairo',
  expiresAt: null,
  addressText: 'Cairo synthetic address',
  cityId: 1,
  price: '300.50',
  commissionRate: '20.0000',
  commissionAmount: '60.10',
  expertEarning: '240.40',
  vatRate: '0.0000',
  vatAmount: '0.00',
  totalAmount: '300.50',
  currency: 'EGP',
  notes: null,
  cancellationReason: null,
  cancelledAt: null,
  createdAt: '2026-10-13T06:00:00.000Z',
  updatedAt: '2026-10-13T06:00:00.000Z',
);

class _DetailGateway implements BookingGateway, PaymentGateway, ReviewGateway {
  /// One-shot gated replies, consumed in order per booking id.
  final bookingGates = <String, Queue<Completer<Booking>>>{};
  final attemptGates = <String, Queue<Completer<List<BookingPayment>>>>{};
  final reviewGates = <String, Queue<Completer<List<BookingReview>>>>{};

  /// Gates already taken, so a test can resolve them out of order.
  final consumedBookingGates = <String, List<Completer<Booking>>>{};
  final consumedAttemptGates =
      <String, List<Completer<List<BookingPayment>>>>{};
  final consumedReviewGates = <String, List<Completer<List<BookingReview>>>>{};

  final bookingResults = <String, Booking>{};
  final attemptResults = <String, List<BookingPayment>>{};
  final reviewResults = <String, List<BookingReview>>{};
  ApiFailure? bookingFailure;
  ApiFailure? attemptsFailure;
  ApiFailure? reviewsFailure;
  Booking? cancelled;
  int cancelCalls = 0;

  Future<T> _gated<T>(
    Map<String, Queue<Completer<T>>> gates,
    Map<String, List<Completer<T>>> consumed,
    String key,
    T fallback,
  ) {
    final queue = gates[key];
    if (queue != null && queue.isNotEmpty) {
      final gate = queue.removeFirst();
      (consumed[key] ??= []).add(gate);
      return gate.future;
    }
    return Future.value(fallback);
  }

  @override
  Future<Booking> booking(String id) {
    final failure = bookingFailure;
    if (failure != null) return Future.error(failure);
    return _gated(
      bookingGates,
      consumedBookingGates,
      id,
      bookingResults[id] ?? bookingFixture(id, 'pending'),
    );
  }

  @override
  Future<List<BookingPayment>> attempts(String bookingId) {
    final failure = attemptsFailure;
    if (failure != null) return Future.error(failure);
    return _gated(
      attemptGates,
      consumedAttemptGates,
      bookingId,
      attemptResults[bookingId] ?? const [],
    );
  }

  @override
  Future<List<BookingReview>> forBooking(String bookingId) {
    final failure = reviewsFailure;
    if (failure != null) return Future.error(failure);
    return _gated(
      reviewGates,
      consumedReviewGates,
      bookingId,
      reviewResults[bookingId] ?? const [],
    );
  }

  @override
  Future<Booking> cancel(String id, {String? reason}) {
    cancelCalls++;
    // The refetch that follows must see the new state, like the real server.
    bookingResults[id] = cancelled ?? bookingFixture(id, 'cancelled');
    return Future.value(bookingResults[id]);
  }

  @override
  Future<Booking> complete(String id) =>
      Future.value(bookingResults[id] ?? bookingFixture(id, 'completed'));

  @override
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) =>
      throw UnimplementedError();

  @override
  Future<Booking> createBooking({
    required String expertId,
    required int serviceId,
    required String addressId,
    required String startsAt,
    String? notes,
    required String idempotencyKey,
  }) => throw UnimplementedError();

  @override
  Future<Booking> accept(String id) => throw UnimplementedError();

  @override
  Future<Booking> reject(String id, {String? reason}) =>
      throw UnimplementedError();

  @override
  Future<PaymentIntent> initiate(String bookingId) =>
      throw UnimplementedError();

  @override
  Future<DemoEventResult> sendDemoEvent({
    required String paymentId,
    required String eventId,
    required String outcome,
    required String amount,
    required String currency,
    required String token,
  }) => throw UnimplementedError();

  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) => throw UnimplementedError();
}
