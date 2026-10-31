import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/past_bookings_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  testWidgets('completed list is filtered and paginated by the server', (
    tester,
  ) async {
    final gateway = _Bookings(
      pages: {
        'completed': [
          [_booking('c1'), _booking('c2')],
          [_booking('c3')],
        ],
      },
    );
    await tester.pumpWidget(_app(ExpertPastBookingsScreen(bookings: gateway)));
    await tester.pumpAndSettle();

    expect(gateway.pageCalls, [('completed', 1)]);
    expect(find.byKey(const ValueKey('past-c1')), findsOneWidget);
    expect(find.byKey(const ValueKey('past-c2')), findsOneWidget);
    expect(find.byKey(const ValueKey('past-c3')), findsNothing);

    await tester.ensureVisible(find.byKey(const ValueKey('past-load-more')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('past-load-more')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('past-c3')), findsOneWidget);
    expect(gateway.pageCalls, [('completed', 1), ('completed', 2)]);
  });

  testWidgets('past states are reachable by filter and never mix pages', (
    tester,
  ) async {
    final gateway = _Bookings(
      pages: {
        'cancelled': [
          [_booking('x1', status: 'cancelled')],
        ],
        'expired': [
          [_booking('e1', status: 'expired')],
        ],
      },
    );
    await tester.pumpWidget(_app(ExpertPastBookingsScreen(bookings: gateway)));
    await tester.pumpAndSettle();

    expect(gateway.pageCalls, [('completed', 1)]);

    await tester.tap(find.byKey(const ValueKey('past-filter-cancelled')));
    await tester.pumpAndSettle();
    expect(gateway.pageCalls.last, ('cancelled', 1));
    expect(find.byKey(const ValueKey('past-x1')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('past-filter-expired')));
    await tester.pumpAndSettle();
    expect(gateway.pageCalls.last, ('expired', 1));
    expect(find.byKey(const ValueKey('past-e1')), findsOneWidget);
    // The previous filter's row is gone rather than appended.
    expect(find.byKey(const ValueKey('past-x1')), findsNothing);
  });

  testWidgets('opening a completed booking after a rebuild refetches detail', (
    tester,
  ) async {
    final gateway = _Bookings(
      pages: {
        'completed': [
          [_booking('c1', status: 'completed')],
        ],
      },
      details: {'c1': _booking('c1', status: 'completed')},
    );
    await tester.pumpWidget(_app(ExpertPastBookingsScreen(bookings: gateway)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('past-c1')));
    await tester.pumpAndSettle();
    expect(gateway.detailCalls, ['c1']);
    expect(find.text('تفاصيل الحجز'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();

    // A fresh screen (app restart) asks the server again instead of trusting
    // the DTO the list already holds.
    await tester.pumpWidget(_app(ExpertPastBookingsScreen(bookings: gateway)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('past-c1')));
    await tester.pumpAndSettle();

    expect(gateway.detailCalls, ['c1', 'c1']);
    expect(
      gateway.pageCalls.where((call) => call == ('completed', 1)).length,
      2,
    );
  });

  testWidgets('a late review submits from the reopened completed booking', (
    tester,
  ) async {
    final gateway = _Bookings(
      pages: {
        'completed': [
          [_booking('c1', status: 'completed')],
        ],
      },
      details: {'c1': _booking('c1', status: 'completed')},
    );
    final reviews = _Reviews();
    await tester.pumpWidget(
      _app(
        ExpertPastBookingsScreen(
          bookings: gateway,
          reviews: reviews,
          currentUserId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('past-c1')));
    await tester.pumpAndSettle();

    await tester.ensureVisible(
      find.byKey(const ValueKey('expert-review-star-3')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('expert-review-star-3')));
    await tester.pump();
    await tester.enterText(
      find.byKey(const ValueKey('expert-review-comment')),
      'عميلة محترمة',
    );
    await tester.ensureVisible(
      find.byKey(const ValueKey('expert-review-submit')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('expert-review-submit')));
    await tester.pumpAndSettle();

    expect(reviews.submits, ['c1:3:عميلة محترمة']);
    expect(find.textContaining('تقييمك: '), findsOneWidget);
  });

  testWidgets('a duplicate review is reported and never claimed as saved', (
    tester,
  ) async {
    final gateway = _Bookings(
      pages: {
        'completed': [
          [_booking('c1', status: 'completed')],
        ],
      },
      details: {'c1': _booking('c1', status: 'completed')},
    );
    final reviews = _Reviews()
      ..failSubmitWith = const ApiFailure(
        kind: ApiFailureKind.conflict,
        code: 'DUPLICATE_REVIEW',
        message: 'duplicate',
      );
    await tester.pumpWidget(
      _app(
        ExpertPastBookingsScreen(
          bookings: gateway,
          reviews: reviews,
          currentUserId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('past-c1')));
    await tester.pumpAndSettle();

    await tester.ensureVisible(
      find.byKey(const ValueKey('expert-review-submit')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('expert-review-submit')));
    await tester.pumpAndSettle();

    expect(reviews.submits, ['c1:5:']);
    expect(find.text('سبق أن قيّمتِ هذا الحجز.'), findsOneWidget);
    expect(find.textContaining('شكرًا'), findsNothing);
  });

  testWidgets('an existing review replaces the form', (tester) async {
    final gateway = _Bookings(
      pages: {
        'completed': [
          [_booking('c1', status: 'completed')],
        ],
      },
      details: {'c1': _booking('c1', status: 'completed')},
    );
    final reviews = _Reviews(
      existing: const [
        BookingReview(
          id: 'r1',
          bookingId: 'c1',
          rating: 5,
          comment: 'خدمة ممتازة',
          reviewerId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
          fromCustomer: false,
          createdAt: '2026-10-14T07:00:00.000Z',
        ),
      ],
    );
    await tester.pumpWidget(
      _app(
        ExpertPastBookingsScreen(
          bookings: gateway,
          reviews: reviews,
          currentUserId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('past-c1')));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.textContaining('خدمة ممتازة'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('expert-review-submit')), findsNothing);
  });

  testWidgets('no review form is offered for a booking that is not completed', (
    tester,
  ) async {
    final gateway = _Bookings(
      pages: {
        'cancelled': [
          [_booking('x1', status: 'cancelled')],
        ],
      },
      details: {'x1': _booking('x1', status: 'cancelled')},
    );
    final reviews = _Reviews();
    await tester.pumpWidget(
      _app(
        ExpertPastBookingsScreen(
          bookings: gateway,
          reviews: reviews,
          currentUserId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('past-filter-cancelled')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('past-x1')));
    await tester.pumpAndSettle();

    expect(reviews.forBookingCalls, isEmpty);
    expect(find.byKey(const ValueKey('expert-review-submit')), findsNothing);
    expect(find.text('قيّمي التجربة'), findsNothing);
  });

  testWidgets('an in-flight first page shows the loading state', (
    tester,
  ) async {
    final gateway = _Bookings();
    final gate = Completer<void>();
    gateway.gate = gate.future;
    await tester.pumpWidget(_app(ExpertPastBookingsScreen(bookings: gateway)));
    await tester.pump();

    expect(find.text('جارٍ تحميل الحجوزات السابقة…'), findsOneWidget);
    expect(find.byKey(const ValueKey('past-load-more')), findsNothing);

    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('لا توجد حجوزات بهذه الحالة بعد.'), findsOneWidget);
  });

  testWidgets('empty, error and forbidden states are explicit', (tester) async {
    final empty = _Bookings();
    await tester.pumpWidget(
      _app(
        ExpertPastBookingsScreen(bookings: empty),
        key: const ValueKey('s-empty'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('لا توجد حجوزات بهذه الحالة بعد.'), findsOneWidget);

    final failing = _Bookings(
      listFailure: const ApiFailure(
        kind: ApiFailureKind.server,
        code: 'FAILED',
        message: 'تعذر التحميل',
      ),
    );
    await tester.pumpWidget(
      _app(
        ExpertPastBookingsScreen(bookings: failing),
        key: const ValueKey('s-fail'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('تعذر التحميل'), findsOneWidget);

    failing.listFailure = null;
    failing.pages['completed'] = [
      [_booking('c1', status: 'completed')],
    ];
    // The first-load failure renders the full-screen status view, whose own
    // retry re-reads page one.
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('past-c1')), findsOneWidget);

    final forbidden = _Bookings(
      listFailure: const ApiFailure(
        kind: ApiFailureKind.forbidden,
        code: 'FORBIDDEN',
        message: 'ممنوع',
      ),
    );
    await tester.pumpWidget(
      _app(
        ExpertPastBookingsScreen(bookings: forbidden),
        key: const ValueKey('s-forbidden'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('غير مسموح'), findsOneWidget);

    final expired = _Bookings(
      listFailure: const ApiFailure(
        kind: ApiFailureKind.unauthorized,
        code: 'UNAUTHENTICATED',
        message: 'expired',
      ),
    );
    await tester.pumpWidget(
      _app(
        ExpertPastBookingsScreen(bookings: expired),
        key: const ValueKey('s-expired'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('انتهت الجلسة، سجلي الدخول مجددًا'), findsOneWidget);
  });
}

Widget _app(Widget child, {Key? key}) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  // A per-scenario key stops Flutter from reusing the previous screen's State
  // and silently keeping the old gateway's result.
  home: Scaffold(
    body: KeyedSubtree(key: key, child: child),
  ),
);

Booking _booking(String id, {String status = 'completed'}) => Booking(
  id: id,
  customerId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  expertId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  serviceId: 7,
  status: status,
  startsAt: '2026-10-14T07:00:00.000Z',
  endsAt: '2026-10-14T08:00:00.000Z',
  timeZone: 'Africa/Cairo',
  expiresAt: null,
  addressText: '12 شارع التحرير، القاهرة',
  cityId: 1,
  price: '300.50',
  commissionRate: '20',
  commissionAmount: '60.10',
  expertEarning: '240.40',
  vatRate: '0',
  vatAmount: '0.00',
  totalAmount: '300.50',
  currency: 'EGP',
  notes: null,
  cancellationReason: null,
  cancelledAt: null,
  createdAt: '2026-10-13T06:00:00.000Z',
  updatedAt: '2026-10-14T07:00:00.000Z',
  statusHistory: const [
    BookingStatusEntry(
      status: 'pending',
      changedAt: '2026-10-13T06:00:00.000Z',
    ),
    BookingStatusEntry(
      status: 'accepted',
      changedAt: '2026-10-13T06:05:00.000Z',
    ),
    BookingStatusEntry(
      status: 'completed',
      changedAt: '2026-10-14T08:00:00.000Z',
    ),
  ],
);

class _Bookings implements BookingGateway {
  _Bookings({
    Map<String, List<List<Booking>>>? pages,
    this.listFailure,
    this.details = const {},
  }) : pages = <String, List<List<Booking>>>{...?pages};

  /// Mutable so a test can add a page between retries.
  final Map<String, List<List<Booking>>> pages;
  final Map<String, Booking> details;
  ApiFailure? listFailure;

  /// Held open to keep a request in flight, so the loading view is observable.
  Future<void>? gate;
  final pageCalls = <(String?, int)>[];
  final detailCalls = <String>[];

  @override
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) async {
    pageCalls.add((status, page));
    final pending = gate;
    if (pending != null) await pending;
    final failure = listFailure;
    if (failure != null) throw failure;
    final byStatus = pages[status] ?? const <List<Booking>>[];
    final items = page <= byStatus.length
        ? byStatus[page - 1]
        : const <Booking>[];
    return CatalogPage<Booking>(
      items: items,
      page: page,
      limit: 20,
      hasNext: page < byStatus.length,
    );
  }

  @override
  Future<Booking> booking(String id) async {
    detailCalls.add(id);
    return details[id] ?? _booking(id);
  }

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
  Future<Booking> cancel(String id, {String? reason}) =>
      throw UnimplementedError();

  @override
  Future<Booking> complete(String id) => throw UnimplementedError();
}

class _Reviews implements ReviewGateway {
  _Reviews({List<BookingReview>? existing}) : existing = [...?existing];

  /// Growable: a successful submit must be visible to the reload that follows.
  final List<BookingReview> existing;
  final submits = <String>[];
  final forBookingCalls = <String>[];
  ApiFailure? failSubmitWith;

  @override
  Future<List<BookingReview>> forBooking(String bookingId) async {
    forBookingCalls.add(bookingId);
    return existing;
  }

  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) async {
    // Recorded as an attempt even when the server rejects it, so a test can
    // assert the app really submitted once instead of failing silently.
    submits.add('$bookingId:$rating:${comment ?? ''}');
    final failure = failSubmitWith;
    if (failure != null) throw failure;
    final review = BookingReview(
      id: 'r-new',
      bookingId: bookingId,
      rating: rating,
      comment: comment,
      reviewerId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      fromCustomer: false,
      createdAt: '2026-10-14T09:00:00.000Z',
    );
    existing.add(review);
    return review;
  }
}
