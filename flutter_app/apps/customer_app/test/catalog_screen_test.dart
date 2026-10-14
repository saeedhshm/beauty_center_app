import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/catalog_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  testWidgets('catalog shows loading then API experts', (tester) async {
    final pending = Completer<CatalogPage<PublicExpert>>();
    final gateway = FakeCatalogGateway(onExperts: (_) => pending.future);

    await tester.pumpWidget(
      testApp(
        CatalogScreen(
          gateway: gateway,
          availability: FakeAvailabilityGateway(),
          addresses: FakeAddressGateway(),
          bookings: FakeBookingGateway(),
          payments: FakePaymentGateway(),
          reviews: FakeReviewGateway(),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    pending.complete(expertPage([expert('e1', 'Expert one')]));
    await tester.pumpAndSettle();
    expect(find.text('Expert one'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Sort experts')), findsWidgets);
    expect(gateway.expertRequests.single.cityId, 1);
    expect(gateway.expertRequests.single.sort, ExpertSort.nameAsc);
  });

  testWidgets('catalog renders empty response', (tester) async {
    final gateway = FakeCatalogGateway(
      onExperts: (_) async => expertPage(const []),
    );
    await tester.pumpWidget(
      testApp(
        CatalogScreen(
          gateway: gateway,
          availability: FakeAvailabilityGateway(),
          addresses: FakeAddressGateway(),
          bookings: FakeBookingGateway(),
          payments: FakePaymentGateway(),
          reviews: FakeReviewGateway(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final status = tester.widget<LamsaStatusView>(find.byType(LamsaStatusView));
    expect(status.status, LamsaStatus.empty);
  });

  testWidgets('catalog renders gateway error and retries', (tester) async {
    var fails = true;
    final gateway = FakeCatalogGateway(
      onExperts: (_) async {
        if (fails) {
          throw const ApiFailure(
            kind: ApiFailureKind.server,
            code: 'FAILED',
            message: 'server failed',
          );
        }
        return expertPage([expert('e1', 'Recovered expert')]);
      },
    );
    await tester.pumpWidget(
      testApp(
        CatalogScreen(
          gateway: gateway,
          availability: FakeAvailabilityGateway(),
          addresses: FakeAddressGateway(),
          bookings: FakeBookingGateway(),
          payments: FakePaymentGateway(),
          reviews: FakeReviewGateway(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<LamsaStatusView>(find.byType(LamsaStatusView)).status,
      LamsaStatus.error,
    );

    fails = false;
    tester.widget<LamsaStatusView>(find.byType(LamsaStatusView)).onRetry!();
    await tester.pumpAndSettle();
    expect(find.text('Recovered expert'), findsOneWidget);
  });

  testWidgets('catalog appends the next server page', (tester) async {
    final gateway = FakeCatalogGateway(
      onExperts: (request) async => request.page == 1
          ? expertPage([expert('e1', 'First expert')], hasNext: true)
          : expertPage([expert('e2', 'Second expert')], page: 2),
    );
    await tester.pumpWidget(
      testApp(
        CatalogScreen(
          gateway: gateway,
          availability: FakeAvailabilityGateway(),
          addresses: FakeAddressGateway(),
          bookings: FakeBookingGateway(),
          payments: FakePaymentGateway(),
          reviews: FakeReviewGateway(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await selectSort(tester, 'Rating: highest first');

    await tapVisible(tester, find.byKey(const Key('catalog-load-more')));
    await tester.pumpAndSettle();
    expect(find.text('First expert'), findsOneWidget);
    expect(find.text('Second expert'), findsOneWidget);
    expect(gateway.expertRequests.map((request) => request.page), [1, 1, 2]);
    expect(gateway.expertRequests.last.sort, ExpertSort.ratingDesc);
  });

  testWidgets('price sort requires a service and resets when it is removed', (
    tester,
  ) async {
    final gateway = FakeCatalogGateway(
      onExperts: (_) async => expertPage([expert('e1', 'Expert one')]),
    );
    await tester.pumpWidget(
      testApp(
        CatalogScreen(
          gateway: gateway,
          availability: FakeAvailabilityGateway(),
          addresses: FakeAddressGateway(),
          bookings: FakeBookingGateway(),
          payments: FakePaymentGateway(),
          reviews: FakeReviewGateway(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('catalog-sort')));
    await tester.pumpAndSettle();
    expect(find.text('Price: lowest first'), findsNothing);
    await tester.tapAt(Offset.zero);
    await tester.pumpAndSettle();

    await tapVisible(tester, find.byKey(const Key('catalog-service-card-10')));
    await tester.pumpAndSettle();
    await selectSort(tester, 'Price: lowest first');
    expect(gateway.expertRequests.last.serviceId, 10);
    expect(gateway.expertRequests.last.sort, ExpertSort.priceAsc);

    await tester.tap(find.byKey(const Key('catalog-service')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('All services').last);
    await tester.pumpAndSettle();

    expect(gateway.expertRequests.last.serviceId, isNull);
    expect(gateway.expertRequests.last.sort, ExpertSort.nameAsc);
    expect(find.text('Name: A to Z'), findsOneWidget);
  });

  testWidgets('catalog ignores an old page after sort change', (tester) async {
    final oldNextPage = Completer<CatalogPage<PublicExpert>>();
    final gateway = FakeCatalogGateway(
      onExperts: (request) {
        if (request.page == 2) return oldNextPage.future;
        if (request.sort == ExpertSort.nameDesc) {
          return Future.value(expertPage([expert('sorted', 'Sorted expert')]));
        }
        return Future.value(
          expertPage([expert('initial', 'Initial expert')], hasNext: true),
        );
      },
    );
    await tester.pumpWidget(
      testApp(
        CatalogScreen(
          gateway: gateway,
          availability: FakeAvailabilityGateway(),
          addresses: FakeAddressGateway(),
          bookings: FakeBookingGateway(),
          payments: FakePaymentGateway(),
          reviews: FakeReviewGateway(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tapVisible(tester, find.byKey(const Key('catalog-load-more')));
    await tester.pump();
    await selectSort(tester, 'Name: Z to A');
    oldNextPage.complete(
      expertPage([expert('old', 'Old sorted page')], page: 2),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sorted expert'), findsOneWidget);
    expect(find.text('Old sorted page'), findsNothing);
    expect(gateway.expertRequests.last.sort, ExpertSort.nameDesc);
  });

  testWidgets('catalog ignores an old next page after filter change', (
    tester,
  ) async {
    final oldNextPage = Completer<CatalogPage<PublicExpert>>();
    final gateway = FakeCatalogGateway(
      onExperts: (request) {
        if (request.page == 2) return oldNextPage.future;
        if (request.serviceId == 10) {
          return Future.value(
            expertPage([expert('filtered', 'Filtered expert')]),
          );
        }
        return Future.value(
          expertPage([expert('initial', 'Initial expert')], hasNext: true),
        );
      },
    );
    await tester.pumpWidget(
      testApp(
        CatalogScreen(
          gateway: gateway,
          availability: FakeAvailabilityGateway(),
          addresses: FakeAddressGateway(),
          bookings: FakeBookingGateway(),
          payments: FakePaymentGateway(),
          reviews: FakeReviewGateway(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tapVisible(tester, find.byKey(const Key('catalog-load-more')));
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('catalog-service-card-10')));
    await tester.pump();

    oldNextPage.complete(
      expertPage([expert('old', 'Old page expert')], page: 2),
    );
    await tester.pumpAndSettle();

    expect(find.text('Filtered expert'), findsOneWidget);
    expect(find.text('Old page expert'), findsNothing);
  });
}

Widget testApp(Widget child) => MaterialApp(
  locale: const Locale('en'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  theme: LamsaTheme.light(),
  home: child,
);

Future<void> selectSort(WidgetTester tester, String label) async {
  await tapVisible(tester, find.byKey(const Key('catalog-sort')));
  await tester.pump(const Duration(seconds: 1));
  await tester.tap(find.text(label).last);
  await tester.pump(const Duration(seconds: 1));
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
}

PublicExpert expert(String id, String name) => PublicExpert(
  id: id,
  name: name,
  cityId: 1,
  cityName: 'Test city',
  bio: null,
  ratingAvg: '4.50',
  ratingCount: 2,
);

CatalogPage<PublicExpert> expertPage(
  List<PublicExpert> items, {
  int page = 1,
  bool hasNext = false,
}) => CatalogPage(items: items, page: page, limit: 20, hasNext: hasNext);

class ExpertRequest {
  const ExpertRequest({
    required this.page,
    required this.cityId,
    required this.sort,
    this.serviceId,
    this.query,
  });
  final int page;
  final int? cityId;
  final ExpertSort sort;
  final int? serviceId;
  final String? query;
}

class FakeAvailabilityGateway implements AvailabilityGateway {
  List<SlotDay> days = const [];
  int calls = 0;

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
  }) async {
    calls += 1;
    return days;
  }
}

class FakeAddressGateway implements AddressGateway {
  @override
  Future<CatalogPage<CustomerAddress>> list({int page = 1, int limit = 20}) =>
      throw UnimplementedError();

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

class FakePaymentGateway implements PaymentGateway {
  @override
  Future<PaymentIntent> initiate(String bookingId) =>
      throw UnimplementedError();

  @override
  Future<List<BookingPayment>> attempts(String bookingId) async => const [];

  @override
  Future<DemoEventResult> sendDemoEvent({
    required String paymentId,
    required String eventId,
    required String outcome,
    required String amount,
    required String currency,
    required String token,
  }) => throw UnimplementedError();
}

class FakeReviewGateway implements ReviewGateway {
  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) => throw UnimplementedError();

  @override
  Future<List<BookingReview>> forBooking(String bookingId) async => const [];
}

class FakeBookingGateway implements BookingGateway {
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
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) =>
      throw UnimplementedError();

  @override
  Future<Booking> booking(String id) => throw UnimplementedError();

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

class FakeCatalogGateway implements CatalogGateway {
  FakeCatalogGateway({required this.onExperts});

  final Future<CatalogPage<PublicExpert>> Function(ExpertRequest request)
  onExperts;
  final expertRequests = <ExpertRequest>[];

  @override
  Future<PublicMapConfiguration> mapConfiguration() =>
      throw UnimplementedError();

  @override
  Future<List<CatalogCity>> cities() async => const [
    CatalogCity(id: 1, name: 'Test city', code: 'TEST', isActive: true),
  ];

  @override
  Future<CatalogPage<CatalogService>> services({
    int page = 1,
    int limit = 20,
  }) async => const CatalogPage(
    items: [
      CatalogService(
        id: 10,
        name: 'Test service',
        description: null,
        durationMin: 30,
        isActive: true,
      ),
    ],
    page: 1,
    limit: 20,
    hasNext: false,
  );

  @override
  Future<CatalogPage<PublicExpert>> experts({
    int page = 1,
    int limit = 20,
    int? cityId,
    int? serviceId,
    String? q,
    ExpertSort sort = ExpertSort.nameAsc,
  }) {
    final request = ExpertRequest(
      page: page,
      cityId: cityId,
      sort: sort,
      serviceId: serviceId,
      query: q,
    );
    expertRequests.add(request);
    return onExperts(request);
  }

  @override
  Future<ExpertDetail> expert(String id) => throw UnimplementedError();

  @override
  Future<List<PortfolioItem>> portfolio(
    String expertId, {
    bool authenticated = false,
  }) => throw UnimplementedError();

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
  }) => throw UnimplementedError();
}
