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

    await tester.pumpWidget(testApp(CatalogScreen(gateway: gateway)));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    pending.complete(expertPage([expert('e1', 'Expert one')]));
    await tester.pumpAndSettle();
    expect(find.text('Expert one'), findsOneWidget);
    expect(gateway.expertRequests.single.cityId, 1);
  });

  testWidgets('catalog renders empty response', (tester) async {
    final gateway = FakeCatalogGateway(
      onExperts: (_) async => expertPage(const []),
    );
    await tester.pumpWidget(testApp(CatalogScreen(gateway: gateway)));
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
    await tester.pumpWidget(testApp(CatalogScreen(gateway: gateway)));
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
    await tester.pumpWidget(testApp(CatalogScreen(gateway: gateway)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('catalog-load-more')));
    await tester.pumpAndSettle();
    expect(find.text('First expert'), findsOneWidget);
    expect(find.text('Second expert'), findsOneWidget);
    expect(gateway.expertRequests.map((request) => request.page), [1, 2]);
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
    await tester.pumpWidget(testApp(CatalogScreen(gateway: gateway)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('catalog-load-more')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('catalog-service-card-10')));
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
    this.serviceId,
    this.query,
  });
  final int page;
  final int? cityId;
  final int? serviceId;
  final String? query;
}

class FakeCatalogGateway implements CatalogGateway {
  FakeCatalogGateway({required this.onExperts});

  final Future<CatalogPage<PublicExpert>> Function(ExpertRequest request)
  onExperts;
  final expertRequests = <ExpertRequest>[];

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
  }) {
    final request = ExpertRequest(
      page: page,
      cityId: cityId,
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
