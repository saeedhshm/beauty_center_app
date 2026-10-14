import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/earnings_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

/// Request-race guards for the expert earnings screen: the transferred
/// filter, pages, and refreshes follow generation discipline, and a stale
/// summary never replaces current figures.
void main() {
  ExpertPayout payout(String id) => ExpertPayout(
    id: id,
    amount: '240.40',
    currency: 'EGP',
    transferRef: null,
    transferredAt: null,
    createdAt: '2026-10-14T06:00:00.000Z',
  );

  CatalogPage<ExpertPayout> pageOf(
    List<ExpertPayout> items, {
    bool hasNext = false,
  }) => CatalogPage(items: items, page: 1, limit: 20, hasNext: hasNext);

  EarningsSummary summaryOf(String eligibleAmount) => EarningsSummary.fromJson({
    'eligible': [
      {'currency': 'EGP', 'amount': eligibleAmount},
    ],
    'recorded': [],
    'transferred': [],
  });

  Future<void> pumpScreen(
    WidgetTester tester,
    _RaceEarningGateway gateway,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        home: Scaffold(body: ExpertEarningsScreen(earnings: gateway)),
      ),
    );
  }

  testWidgets('late response from a previous filter is ignored', (
    tester,
  ) async {
    final gateway = _RaceEarningGateway();
    gateway.summaries.add((() => Future.value(summaryOf('10.00'))));
    gateway.pages['null|1'] = pageOf([payout('seed')]);

    await pumpScreen(tester, gateway);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('payout-seed')), findsOneWidget);

    final oldSummary = Completer<EarningsSummary>();
    final oldPage = Completer<CatalogPage<ExpertPayout>>();
    gateway.summaries.add(() => oldSummary.future);
    gateway.gates['false|1'] = Queue.of([oldPage]);
    await tester.tap(find.byKey(const ValueKey('transfers-filter-recorded')));
    await tester.pump();

    gateway.summaries.add(() => Future.value(summaryOf('20.00')));
    gateway.pages['false|1'] = pageOf([payout('p-new')]);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('payout-p-new')), findsOneWidget);
    expect(find.text('20.00 EGP'), findsOneWidget);

    oldSummary.complete(summaryOf('99.00'));
    oldPage.complete(pageOf([payout('p-old')]));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-p-new')), findsOneWidget);
    expect(find.byKey(const ValueKey('payout-p-old')), findsNothing);
    expect(find.text('20.00 EGP'), findsOneWidget);
    expect(find.text('99.00 EGP'), findsNothing);
  });

  testWidgets('stale load-more never merges after a filter change', (
    tester,
  ) async {
    final gateway = _RaceEarningGateway();
    gateway.summaries.add(() => Future.value(summaryOf('10.00')));
    gateway.pages['null|1'] = pageOf([payout('a1')], hasNext: true);
    gateway.summaries.add(() => Future.value(summaryOf('10.00')));
    gateway.pages['true|1'] = pageOf([payout('u1')]);

    await pumpScreen(tester, gateway);
    await tester.pumpAndSettle();

    gateway.gates['null|2'] = Queue.of([
      Completer<CatalogPage<ExpertPayout>>(),
    ]);
    await tester.ensureVisible(find.byKey(const Key('payouts-load-more')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('payouts-load-more')));
    await tester.pump();

    await tester.tap(
      find.byKey(const ValueKey('transfers-filter-transferred')),
    );
    await tester.pumpAndSettle();

    gateway.consumedGates['null|2']!.first.complete(pageOf([payout('a2')]));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-u1')), findsOneWidget);
    expect(find.byKey(const ValueKey('payout-a1')), findsNothing);
    expect(find.byKey(const ValueKey('payout-a2')), findsNothing);
  });

  testWidgets('a newer refresh wins over an older one', (tester) async {
    final gateway = _RaceEarningGateway();
    gateway.summaries.add(() => Future.value(summaryOf('10.00')));
    gateway.pages['null|1'] = pageOf([payout('seed')]);

    await pumpScreen(tester, gateway);
    await tester.pumpAndSettle();

    final oldSummary = Completer<EarningsSummary>();
    final oldPage = Completer<CatalogPage<ExpertPayout>>();
    gateway.summaries.add(() => oldSummary.future);
    gateway.gates['false|1'] = Queue.of([oldPage]);
    await tester.tap(find.byKey(const ValueKey('transfers-filter-recorded')));
    await tester.pump();

    gateway.summaries.add(() => Future.value(summaryOf('20.00')));
    gateway.pages['false|1'] = pageOf([payout('p-second')]);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('payout-p-second')), findsOneWidget);

    oldSummary.complete(summaryOf('30.00'));
    oldPage.complete(pageOf([payout('p-first')]));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-p-second')), findsOneWidget);
    expect(find.byKey(const ValueKey('payout-p-first')), findsNothing);
    expect(find.text('20.00 EGP'), findsOneWidget);
    expect(find.text('30.00 EGP'), findsNothing);
  });

  testWidgets('stale error and finally belong to the old request only', (
    tester,
  ) async {
    final gateway = _RaceEarningGateway();
    final oldSummary = Completer<EarningsSummary>();
    final oldPage = Completer<CatalogPage<ExpertPayout>>();
    gateway.summaries.add(() => oldSummary.future);
    gateway.gates['null|1'] = Queue.of([oldPage]);

    await pumpScreen(tester, gateway);
    await tester.pump();
    // The current request is still loading: spinner visible, no error.
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('إعادة المحاولة'), findsNothing);

    gateway.summaries.add(() => Future.value(summaryOf('10.00')));
    gateway.pages['null|1'] = pageOf([payout('u1')]);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('payout-u1')), findsOneWidget);

    // The stale request now fails: no error view, current data stays.
    oldSummary.completeError(Exception('stale summary'));
    oldPage.completeError(Exception('stale boom'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('payout-u1')), findsOneWidget);
    expect(find.text('إعادة المحاولة'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}

class _RaceEarningGateway implements EarningGateway {
  /// Summary responses consumed in call order. Every screen load calls
  /// earnings() exactly once, in the same order as its payouts() call, so
  /// pairing holds without extra context.
  final summaries = Queue<Future<EarningsSummary> Function()>();

  /// One-shot gated payout pages consumed in order per "filter|page" key.
  final gates = <String, Queue<Completer<CatalogPage<ExpertPayout>>>>{};

  /// Gates already consumed, for tests to complete out of order.
  final consumedGates = <String, List<Completer<CatalogPage<ExpertPayout>>>>{};
  final pages = <String, CatalogPage<ExpertPayout>>{};

  @override
  Future<EarningsSummary> earnings() {
    if (summaries.isNotEmpty) return summaries.removeFirst()();
    return Future.value(
      EarningsSummary.fromJson({
        'eligible': [],
        'recorded': [],
        'transferred': [],
      }),
    );
  }

  @override
  Future<CatalogPage<ExpertPayout>> payouts({bool? transferred, int page = 1}) {
    final key = '$transferred|$page';
    final queue = gates[key];
    if (queue != null && queue.isNotEmpty) {
      final gate = queue.removeFirst();
      (consumedGates[key] ??= []).add(gate);
      return gate.future;
    }
    return Future.value(
      pages[key] ??
          CatalogPage(items: const [], page: page, limit: 20, hasNext: false),
    );
  }

  @override
  Future<ExpertPayout> payout(String id) => throw UnimplementedError();
}
