import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/bookings_screen.dart';
import 'package:lamsa_customer/src/cairo_slot_time.dart';
import 'package:lamsa_customer/src/catalog_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  setUpAll(ensureCairoTime);

  testWidgets('slot tap reviews server amounts and creates once', (
    tester,
  ) async {
    final bookings = _BookingsGateway();
    bookings.createGate = Completer<Booking>();
    await tester.pumpWidget(
      testApp(
        ExpertDetailScreen(
          gateway: _DetailGateway(),
          availability: _SlotsGateway(),
          addresses: _AddressesGateway(),
          bookings: bookings,
          expertId: 'expert-1',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('10:00 – 11:00'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('10:00 – 11:00'));
    await tester.pumpAndSettle();

    // Review shows server values only.
    expect(find.text('مراجعة الحجز'), findsOneWidget);
    expect(find.text('300.50 EGP · 60 دقيقة'), findsWidgets);

    await tester.tap(find.byKey(const ValueKey('booking-confirm')));
    await tester.pump();
    // Duplicate taps while sending do not resend.
    await tester.tap(
      find.byKey(const ValueKey('booking-confirm')),
      warnIfMissed: false,
    );
    await tester.pump();
    bookings.createGate!.complete(_booking());
    await tester.pumpAndSettle();

    expect(bookings.created, hasLength(1));
    expect(bookings.keys.single, hasLength(36));
    expect(find.text('تفاصيل الحجز'), findsOneWidget);
    expect(find.text('معلق'), findsWidgets);
  });

  testWidgets('list, detail history, and allowed cancel', (tester) async {
    final bookings = _BookingsGateway();
    await tester.pumpWidget(
      testApp(Scaffold(body: CustomerBookingsScreen(bookings: bookings))),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('300.50 EGP'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('booking-b1')));
    await tester.pumpAndSettle();

    expect(find.text('سجل الحالات'), findsOneWidget);
    expect(find.text('معلق'), findsWidgets);

    await tester.ensureVisible(find.byKey(const ValueKey('booking-cancel')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('booking-cancel')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cancel-confirm')));
    await tester.pumpAndSettle();

    expect(bookings.cancelled, ['b1']);
    expect(find.text('أُلغي الحجز'), findsOneWidget);
  });

  testWidgets('conflict on cancel reloads the current state', (tester) async {
    final bookings = _BookingsGateway(
      cancelError: const ApiFailure(
        kind: ApiFailureKind.conflict,
        code: 'INVALID_TRANSITION',
        message: 'changed',
      ),
    );
    await tester.pumpWidget(
      testApp(
        BookingDetailScreen(bookings: bookings, bookingId: 'b1'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byKey(const ValueKey('booking-cancel')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('booking-cancel')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cancel-confirm')));
    await tester.pumpAndSettle();

    expect(
      find.text('تغيرت حالة الحجز. حُدثت الحالة الحالية.'),
      findsOneWidget,
    );
    expect(bookings.detailCalls, greaterThanOrEqualTo(2));
  });
}

Widget testApp(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  theme: LamsaTheme.light(),
  home: child,
);

Booking _booking({String status = 'pending'}) => Booking(
  id: 'b1',
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
  statusHistory: const [
    BookingStatusEntry(
      status: 'pending',
      changedAt: '2026-10-13T06:00:00.000Z',
    ),
  ],
);

class _DetailGateway implements CatalogGateway {
  @override
  Future<PublicMapConfiguration> mapConfiguration() =>
      throw UnimplementedError();

  @override
  Future<List<CatalogCity>> cities() => throw UnimplementedError();

  @override
  Future<CatalogPage<CatalogService>> services({int page = 1, int limit = 20}) =>
      throw UnimplementedError();

  @override
  Future<CatalogPage<PublicExpert>> experts({
    int page = 1,
    int limit = 20,
    int? cityId,
    int? serviceId,
    String? q,
    ExpertSort sort = ExpertSort.nameAsc,
  }) => throw UnimplementedError();

  @override
  Future<ExpertDetail> expert(String id) async => const ExpertDetail(
    id: 'expert-1',
    name: 'خبيرة الاختبار',
    cityId: 1,
    cityName: 'القاهرة',
    bio: null,
    ratingAvg: '4.50',
    ratingCount: 2,
    services: [
      ExpertOffering(
        serviceId: 7,
        name: 'تصفيف الشعر',
        description: null,
        durationMin: 60,
        price: '300.50',
        currency: 'EGP',
        isActive: true,
        serviceIsActive: true,
      ),
    ],
  );

  @override
  Future<List<PortfolioItem>> portfolio(
    String expertId, {
    bool authenticated = false,
  }) async => const [];

  @override
  Future<List<int>> portfolioBytes(
    String relativeUrl, {
    bool authenticated = false,
  }) => throw UnimplementedError();

  @override
  Future<CatalogPage<PublicReview>> reviews(
    String expertId, {
    int page = 1,
    int limit = 20,
  }) async => const CatalogPage(
    items: <PublicReview>[],
    page: 1,
    limit: 20,
    hasNext: false,
  );
}

class _SlotsGateway implements AvailabilityGateway {
  @override
  Future<List<WeeklySlot>> weekly() => throw UnimplementedError();

  @override
  Future<List<WeeklySlot>> replaceWeekly(List<WeeklySlot> slots) =>
      throw UnimplementedError();

  @override
  Future<List<AvailabilityExceptionItem>> exceptions() =>
      throw UnimplementedError();

  @override
  Future<AvailabilityExceptionItem> addException({
    required String date,
    String? startTime,
    String? endTime,
    required String type,
    String? reason,
  }) => throw UnimplementedError();

  @override
  Future<void> deleteException(String id) => throw UnimplementedError();

  @override
  Future<List<SlotDay>> slots({
    required String expertId,
    required int serviceId,
    required String from,
    required String to,
  }) async => const [
    SlotDay(
      date: '2026-10-20',
      slots: [
        ExpertSlot(
          startsAt: '2026-10-20T07:00:00.000Z',
          endsAt: '2026-10-20T08:00:00.000Z',
        ),
      ],
    ),
  ];
}

class _AddressesGateway implements AddressGateway {
  @override
  Future<CatalogPage<CustomerAddress>> list({int page = 1, int limit = 20}) async =>
      const CatalogPage(
        items: [
          CustomerAddress(
            id: 'a1',
            label: 'home',
            addressText: 'Cairo synthetic address',
            cityId: 1,
            lat: '30.05',
            lng: '31.24',
            isDefault: true,
          ),
        ],
        page: 1,
        limit: 20,
        hasNext: false,
      );

  @override
  Future<CustomerAddress> create({
    required String label,
    required String addressText,
    required int cityId,
    required String lat,
    required String lng,
    bool isDefault = false,
  }) => throw UnimplementedError();

  @override
  Future<CustomerAddress> update(String id, AddressDraft input) =>
      throw UnimplementedError();

  @override
  Future<void> delete(String id) => throw UnimplementedError();
}

class _BookingsGateway implements BookingGateway {
  _BookingsGateway({this.cancelError});

  final ApiFailure? cancelError;
  final created = <Booking>[];
  final keys = <String>[];
  final cancelled = <String>[];
  int detailCalls = 0;
  Completer<Booking>? createGate;

  @override
  Future<Booking> createBooking({
    required String expertId,
    required int serviceId,
    required String addressId,
    required String startsAt,
    String? notes,
    required String idempotencyKey,
  }) async {
    keys.add(idempotencyKey);
    if (createGate != null) {
      final booking = await createGate!.future;
      created.add(booking);
      return booking;
    }
    final booking = _booking();
    created.add(booking);
    return booking;
  }

  @override
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) async =>
      CatalogPage(
        items: [_booking()],
        page: 1,
        limit: 20,
        hasNext: false,
      );

  @override
  Future<Booking> booking(String id) async {
    detailCalls += 1;
    return _booking();
  }

  @override
  Future<Booking> accept(String id) => throw UnimplementedError();

  @override
  Future<Booking> reject(String id, {String? reason}) =>
      throw UnimplementedError();

  @override
  Future<Booking> cancel(String id, {String? reason}) async {
    if (cancelError != null) throw cancelError!;
    cancelled.add(id);
    return _booking(status: 'cancelled');
  }
}
