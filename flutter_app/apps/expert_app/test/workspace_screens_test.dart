import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/portfolio_screen.dart';
import 'package:lamsa_expert/src/services_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  testWidgets('service toggle waits for the server result', (tester) async {
    final workspace = _WorkspaceGateway(
      servicesValue: const [_service],
      saveCompleter: Completer<ExpertService>(),
    );
    await tester.pumpWidget(
      _app(
        ExpertServicesScreen(workspace: workspace, catalog: _CatalogGateway()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.pause_circle_outline));
    await tester.pump();

    expect(workspace.savedActive, isFalse);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('250.00 EGP'), findsOneWidget);
    expect(find.text('العرض نشط'), findsOneWidget);
    expect(find.text('العرض متوقف'), findsNothing);

    workspace.saveCompleter!.complete(
      const ExpertService(
        expertId: 'expert-1',
        serviceId: 1,
        name: 'تصفيف الشعر',
        description: null,
        durationMin: 60,
        price: '275.50',
        currency: 'EGP',
        isActive: false,
        serviceIsActive: true,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('275.50'), findsOneWidget);
    expect(find.text('العرض نشط'), findsNothing);
    expect(find.text('العرض متوقف'), findsOneWidget);
    expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
  });

  testWidgets('invalid pasted prices are rejected without transformation', (
    tester,
  ) async {
    final workspace = _WorkspaceGateway(servicesValue: const [_service]);
    await tester.pumpWidget(
      _app(
        ExpertServicesScreen(workspace: workspace, catalog: _CatalogGateway()),
      ),
    );
    await tester.pumpAndSettle();

    for (final invalid in ['1e3', '-1', '1,000']) {
      await tester.tap(find.byIcon(Icons.edit_outlined));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('service-price-field')),
        invalid,
      );
      await tester.tap(find.byType(FilledButton).last);
      await tester.pump();

      expect(
        find.text('أدخلي سعرًا صحيحًا حتى 8 أرقام ومنزلتين عشريتين.'),
        findsOneWidget,
      );
      expect(workspace.saveCalls, 0);
      await tester.tap(find.text('إلغاء'));
      await tester.pumpAndSettle();
    }
  });

  testWidgets('partial service response preserves inactive service metadata', (
    tester,
  ) async {
    const inactive = ExpertService(
      expertId: 'expert-1',
      serviceId: 2,
      name: 'خدمة متوقفة',
      description: 'وصف',
      durationMin: 45,
      price: '100.00',
      currency: 'EGP',
      isActive: false,
      serviceIsActive: false,
    );
    final workspace = _WorkspaceGateway(
      servicesValue: const [inactive],
      savedValue: const ExpertService(
        expertId: 'expert-1',
        serviceId: 2,
        name: null,
        description: null,
        durationMin: null,
        price: '125.00',
        currency: 'EGP',
        isActive: false,
        serviceIsActive: null,
      ),
    );
    await tester.pumpWidget(
      _app(
        ExpertServicesScreen(workspace: workspace, catalog: _CatalogGateway()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.edit_outlined));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('service-price-field')),
      '125.00',
    );
    await tester.tap(find.byType(FilledButton).last);
    await tester.pumpAndSettle();

    expect(find.text('خدمة متوقفة'), findsOneWidget);
    expect(find.text('45 دقيقة'), findsOneWidget);
    expect(find.text('الخدمة العامة متوقفة'), findsOneWidget);
    expect(find.text('125.00 EGP'), findsOneWidget);
  });

  testWidgets('forbidden portfolio has a dedicated state', (tester) async {
    final workspace = _WorkspaceGateway(
      failure: const ApiFailure(
        kind: ApiFailureKind.forbidden,
        code: 'FORBIDDEN',
        message: 'غير مسموح',
      ),
    );
    await tester.pumpWidget(
      _app(PortfolioScreen(workspace: workspace, expertId: 'expert-1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('غير مسموح'), findsOneWidget);
    expect(find.byIcon(Icons.lock_outline_rounded), findsOneWidget);
  });

  testWidgets('portfolio deletion is not optimistic', (tester) async {
    final deleteCompleter = Completer<void>();
    final workspace = _WorkspaceGateway(
      portfolioValue: const [
        PortfolioItem(
          id: 'image-1',
          serviceId: null,
          sortOrder: 0,
          url: '/api/v1/portfolio/image-1/file',
        ),
      ],
      deleteCompleter: deleteCompleter,
    );
    await tester.pumpWidget(
      _app(PortfolioScreen(workspace: workspace, expertId: 'expert-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FilledButton).last);
    await tester.pump();
    expect(find.byIcon(Icons.delete_outline), findsOneWidget);

    deleteCompleter.complete();
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.delete_outline), findsNothing);
  });
}

Widget _app(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

const _service = ExpertService(
  expertId: 'expert-1',
  serviceId: 1,
  name: 'تصفيف الشعر',
  description: null,
  durationMin: 60,
  price: '250.00',
  currency: 'EGP',
  isActive: true,
  serviceIsActive: true,
);

class _WorkspaceGateway implements ExpertWorkspaceGateway {
  _WorkspaceGateway({
    this.servicesValue = const [],
    this.portfolioValue = const [],
    this.failure,
    this.saveCompleter,
    this.deleteCompleter,
    this.savedValue,
  });

  final List<ExpertService> servicesValue;
  final List<PortfolioItem> portfolioValue;
  final ApiFailure? failure;
  final Completer<ExpertService>? saveCompleter;
  final Completer<void>? deleteCompleter;
  final ExpertService? savedValue;
  bool? savedActive;
  int saveCalls = 0;

  @override
  Future<List<ExpertService>> services() async {
    if (failure case final value?) throw value;
    return servicesValue;
  }

  @override
  Future<List<PortfolioItem>> portfolio(String expertId) async {
    if (failure case final value?) throw value;
    return portfolioValue;
  }

  @override
  Future<List<int>> portfolioBytes(String relativeUrl) async => const [0];

  @override
  Future<ExpertService> upsertService({
    required int serviceId,
    required String price,
    required bool isActive,
  }) async {
    saveCalls += 1;
    savedActive = isActive;
    return saveCompleter?.future ?? savedValue ?? _service;
  }

  @override
  Future<void> deletePortfolio(String id) =>
      deleteCompleter?.future ?? Future.value();

  @override
  Future<PortfolioItem> uploadPortfolio({
    required List<int> bytes,
    required String filename,
    required String contentType,
    int? serviceId,
  }) => throw UnimplementedError();
}

class _CatalogGateway implements CatalogGateway {
  @override
  Future<CatalogPage<CatalogService>> services({
    int page = 1,
    int limit = 20,
  }) async => const CatalogPage(
    items: [
      CatalogService(
        id: 1,
        name: 'تصفيف الشعر',
        description: null,
        durationMin: 60,
        isActive: true,
      ),
    ],
    page: 1,
    limit: 20,
    hasNext: false,
  );
  @override
  Future<List<CatalogCity>> cities() => throw UnimplementedError();
  @override
  Future<ExpertDetail> expert(String id) => throw UnimplementedError();
  @override
  Future<CatalogPage<PublicExpert>> experts({
    int page = 1,
    int limit = 20,
    int? cityId,
    int? serviceId,
    String? q,
  }) => throw UnimplementedError();
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
