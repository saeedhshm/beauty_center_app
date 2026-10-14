import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/requests_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  testWidgets('accept waits for the server then reloads', (tester) async {
    final gateway = _BookingGateway(items: [_pending('b1')]);
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    expect(find.text('مقبول'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('request-accept-b1')));
    await tester.pumpAndSettle();

    expect(gateway.accepted, ['b1']);
    expect(find.text('قُبل الطلب بانتظار دفع العميلة'), findsOneWidget);
    expect(gateway.listCalls, 5);
  });

  testWidgets('reject sends the reason and reloads', (tester) async {
    final gateway = _BookingGateway(items: [_pending('b2')]);
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('request-reject-b2')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('reject-reason')),
      'مشغولة',
    );
    await tester.tap(find.text('رفض الطلب').last);
    await tester.pumpAndSettle();

    expect(gateway.rejected, ['b2']);
    expect(gateway.rejectedReasons, ['مشغولة']);
    expect(find.text('رُفض الطلب'), findsOneWidget);
  });

  testWidgets('expired accept shows guidance and reloads', (tester) async {
    final gateway = _BookingGateway(
      items: [_pending('b3')],
      acceptError: const ApiFailure(
        kind: ApiFailureKind.conflict,
        code: 'BOOKING_EXPIRED',
        message: 'expired',
      ),
    );
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('request-accept-b3')));
    await tester.pumpAndSettle();

    expect(find.text('انتهت مهلة هذا الطلب.'), findsOneWidget);
    expect(gateway.listCalls, 5);
  });

  testWidgets('empty inbox is explicit', (tester) async {
    final gateway = _BookingGateway(items: const []);
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    expect(find.text('لا توجد طلبات معلقة حاليًا.'), findsOneWidget);
    expect(find.text('لا توجد حجوزات مقبولة بانتظار الدفع.'), findsOneWidget);
    expect(find.text('لا توجد حجوزات مؤكدة حاليًا.'), findsOneWidget);
  });

  testWidgets('second pending page appears after load more', (tester) async {
    final gateway = _BookingGateway(
      items: [_pending('p1'), _pending('p2'), _pending('p3')],
    );
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('request-accept-p1')), findsOneWidget);
    expect(find.byKey(const ValueKey('request-accept-p2')), findsOneWidget);
    expect(find.byKey(const ValueKey('request-accept-p3')), findsNothing);
    expect(find.byKey(const ValueKey('load-more-pending')), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('load-more-pending')),
      500,
    );
    await tester.tap(find.byKey(const ValueKey('load-more-pending')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('request-accept-p3')), findsOneWidget);
    expect(find.byKey(const ValueKey('load-more-pending')), findsNothing);
    expect(gateway.pageCalls.where((call) => call.$1 == 'pending').toList(), [
      ('pending', 1),
      ('pending', 2),
    ]);
  });

  testWidgets('sections page independently without mixing results', (
    tester,
  ) async {
    final gateway = _BookingGateway(
      items: [
        _pending('p1'),
        _pending('p2'),
        _pending('p3'),
        _accepted('a1'),
        _accepted('a2'),
        _accepted('a3'),
      ],
    );
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('load-more-pending')),
      500,
    );
    await tester.tap(find.byKey(const ValueKey('load-more-pending')));
    await tester.pumpAndSettle();

    // Pending advanced alone; accepted stayed on its first page.
    expect(find.byKey(const ValueKey('request-accept-p3')), findsOneWidget);
    expect(find.byKey(const ValueKey('accepted-a3')), findsNothing);
    expect(gateway.pageCalls, contains(('pending', 2)));
    expect(gateway.pageCalls, isNot(contains(('accepted', 2))));
  });

  testWidgets('stale load does not replace a newer refresh', (tester) async {
    final gateway = _BookingGateway(items: const []);
    final first = Completer<CatalogPage<Booking>>();
    gateway.deferred['pending'] = {1: first};
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pump();

    // Refresh while the first pending fetch is still in flight.
    final second = Completer<CatalogPage<Booking>>();
    gateway.deferred['pending'] = {1: second};
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();

    first.complete(_page([_pending('stale')]));
    await tester.pump();
    second.complete(_page([_pending('fresh')]));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('request-accept-fresh')), findsOneWidget);
    expect(find.byKey(const ValueKey('request-accept-stale')), findsNothing);
  });

  testWidgets('accept moves the booking to the accepted section', (
    tester,
  ) async {
    final gateway = _BookingGateway(items: [_pending('b1')]);
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('request-accept-b1')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('request-accept-b1')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('request-accept-b1')), findsNothing);
    expect(find.text('لا توجد طلبات معلقة حاليًا.'), findsOneWidget);
    expect(find.byKey(const ValueKey('accepted-b1')), findsOneWidget);
  });

  testWidgets('section error stays inline with working siblings', (
    tester,
  ) async {
    final gateway = _BookingGateway(items: [_pending('p1')]);
    gateway.sectionErrors['accepted'] = const ApiFailure(
      kind: ApiFailureKind.server,
      code: 'FAILED',
      message: 'تعذر التحميل',
    );
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    // Pending still renders while accepted shows its own error + retry.
    expect(find.byKey(const ValueKey('request-accept-p1')), findsOneWidget);
    expect(find.byKey(const ValueKey('error-accepted')), findsOneWidget);
    expect(find.byKey(const ValueKey('retry-accepted')), findsOneWidget);

    gateway.sectionErrors.remove('accepted');
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('retry-accepted')),
      500,
    );
    await tester.tap(find.byKey(const ValueKey('retry-accepted')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('error-accepted')), findsNothing);
  });

  testWidgets('accepted bookings show read-only awaiting payment', (
    tester,
  ) async {
    final gateway = _BookingGateway(items: [_pending('b1'), _accepted('b9')]);
    await tester.pumpWidget(
      _app(ExpertRequestsScreen(bookings: gateway, reviews: _ReviewGateway())),
    );
    await tester.pumpAndSettle();

    expect(find.text('مقبول بانتظار الدفع'), findsOneWidget);
    expect(find.byKey(const ValueKey('accepted-b9')), findsOneWidget);
    expect(find.byKey(const ValueKey('request-accept-b9')), findsNothing);
  });

  testWidgets('confirmed sheet completes then reviews the customer', (
    tester,
  ) async {
    final gateway = _BookingGateway(items: [_confirmed('b7')]);
    final reviews = _ExpertReviewsGateway();
    await tester.pumpWidget(
      _app(
        ExpertRequestsScreen(
          bookings: gateway,
          reviews: reviews,
          currentUserId: 'e1',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('مؤكدة وقيد التنفيذ'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('confirmed-b7')));
    await tester.pumpAndSettle();

    // Party-disclosed address is visible per current backend policy.
    expect(find.textContaining('Cairo synthetic address'), findsOneWidget);

    await tester.tap(find.text('تأكيد الإكمال'));
    await tester.pumpAndSettle();
    expect(gateway.completed, ['b7']);
    expect(find.text('سُجل الحجز مكتملًا'), findsOneWidget);

    // Review form appears only after completion.
    await tester.tap(find.byKey(const ValueKey('expert-review-star-5')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('expert-review-submit')));
    await tester.pumpAndSettle();

    expect(reviews.submits, 1);
    expect(reviews.lastRating, 5);
    expect(find.text('شكرًا! سُجل تقييمك.'), findsOneWidget);
  });

  testWidgets('third party review is rejected without leaking', (tester) async {
    final reviews = _ExpertReviewsGateway()
      ..failSubmitWith = const ApiFailure(
        kind: ApiFailureKind.notFound,
        code: 'NOT_FOUND',
        message: 'missing',
      );
    final gateway = _BookingGateway(items: [_confirmed('b8')]);
    await tester.pumpWidget(
      _app(
        ExpertRequestsScreen(
          bookings: gateway,
          reviews: reviews,
          currentUserId: 'stranger',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('confirmed-b8')));
    await tester.pumpAndSettle();
    // Complete first (server allows the party transition), then review.
    await tester.tap(find.text('تأكيد الإكمال'));
    await tester.pumpAndSettle();
    // Already completed: review form is offered, server decides ownership.
    expect(find.byKey(const ValueKey('expert-review-submit')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('expert-review-submit')));
    await tester.pumpAndSettle();

    expect(find.text('missing'), findsOneWidget);
    expect(reviews.submits, 1);
  });
}

CatalogPage<Booking> _page(List<Booking> items) =>
    CatalogPage(items: items, page: 1, limit: 2, hasNext: false);

Booking _accepted(String id) => Booking(
  id: id,
  customerId: 'c1',
  expertId: 'e1',
  serviceId: 7,
  status: 'accepted',
  startsAt: '2026-10-20T07:00:00.000Z',
  endsAt: '2026-10-20T08:00:00.000Z',
  timeZone: 'Africa/Cairo',
  expiresAt: '2026-10-13T07:00:00.000Z',
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

Widget _app(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

Booking _pending(String id) => Booking(
  id: id,
  customerId: 'c1',
  expertId: 'e1',
  serviceId: 7,
  status: 'pending',
  startsAt: '2026-10-20T07:00:00.000Z',
  endsAt: '2026-10-20T08:00:00.000Z',
  timeZone: 'Africa/Cairo',
  expiresAt: '2026-10-13T07:00:00.000Z',
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

class _ReviewGateway implements ReviewGateway {
  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) => throw UnimplementedError();

  @override
  Future<List<BookingReview>> forBooking(String bookingId) async => const [];
}

class _ExpertReviewsGateway implements ReviewGateway {
  int submits = 0;
  int? lastRating;
  Object? failSubmitWith;

  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) async {
    submits += 1;
    if (failSubmitWith != null) throw failSubmitWith!;
    lastRating = rating;
    return BookingReview(
      id: 'r9',
      bookingId: bookingId,
      reviewerId: 'e1',
      revieweeId: 'c1',
      rating: rating,
      comment: comment,
      createdAt: '2026-10-21T08:00:00.000Z',
    );
  }

  @override
  Future<List<BookingReview>> forBooking(String bookingId) async => const [];
}

Booking _confirmed(String id) => _withStatus(id, 'confirmed');

Booking _completed(String id) => _withStatus(id, 'completed');

Booking _withStatus(String id, String status) => Booking(
  id: id,
  customerId: 'c1',
  expertId: 'e1',
  serviceId: 7,
  status: status,
  startsAt: '2026-10-20T07:00:00.000Z',
  endsAt: '2026-10-20T08:00:00.000Z',
  timeZone: 'Africa/Cairo',
  expiresAt: '2026-10-13T07:00:00.000Z',
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

class _BookingGateway implements BookingGateway {
  _BookingGateway({required this.items, this.acceptError});

  List<Booking> items;
  final ApiFailure? acceptError;

  /// Extra pages per status for pagination tests: pages[status][page-1].
  final Map<String, List<List<Booking>>> extraPages = {};
  final Map<String, Object> sectionErrors = {};
  final Map<String, Map<int, Completer<CatalogPage<Booking>>>> deferred = {};
  final accepted = <String>[];
  final rejected = <String>[];
  final rejectedReasons = <String?>[];
  final completed = <String>[];
  int listCalls = 0;
  final List<(String?, int)> pageCalls = [];

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
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) async {
    listCalls += 1;
    pageCalls.add((status, page));
    final gate = deferred[status]?[page];
    if (gate != null) return gate.future;
    final failure = sectionErrors[status ?? ''];
    if (failure != null) throw failure;
    final matching = items
        .where((item) => status == null || item.status == status)
        .toList();
    final extra = extraPages[status] ?? const [];
    final all = [...matching, for (final chunk in extra) ...chunk];
    const limit = 2;
    final start = (page - 1) * limit;
    if (start >= all.length) {
      return CatalogPage(
        items: const [],
        page: page,
        limit: limit,
        hasNext: false,
      );
    }
    final end = (start + limit).clamp(0, all.length);
    return CatalogPage(
      items: all.sublist(start, end),
      page: page,
      limit: limit,
      hasNext: end < all.length,
    );
  }

  @override
  Future<Booking> booking(String id) => throw UnimplementedError();

  @override
  Future<Booking> accept(String id) async {
    if (acceptError != null) throw acceptError!;
    accepted.add(id);
    items = [for (final item in items) item.id == id ? _accepted(id) : item];
    return _accepted(id);
  }

  @override
  Future<Booking> reject(String id, {String? reason}) async {
    rejected.add(id);
    rejectedReasons.add(reason);
    items = items.where((item) => item.id != id).toList();
    return _pending(id);
  }

  @override
  Future<Booking> cancel(String id, {String? reason}) =>
      throw UnimplementedError();

  @override
  Future<Booking> complete(String id) async {
    completed.add(id);
    return _completed(id);
  }
}
