import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/requests_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  testWidgets('accept waits for the server then reloads', (tester) async {
    final gateway = _BookingGateway(items: [_pending('b1')]);
    await tester.pumpWidget(_app(ExpertRequestsScreen(bookings: gateway)));
    await tester.pumpAndSettle();

    expect(find.text('مقبول'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('request-accept-b1')));
    await tester.pumpAndSettle();

    expect(gateway.accepted, ['b1']);
    expect(find.text('قُبل الطلب بانتظار دفع العميلة'), findsOneWidget);
    expect(gateway.listCalls, 4);
  });

  testWidgets('reject sends the reason and reloads', (tester) async {
    final gateway = _BookingGateway(items: [_pending('b2')]);
    await tester.pumpWidget(_app(ExpertRequestsScreen(bookings: gateway)));
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
    await tester.pumpWidget(_app(ExpertRequestsScreen(bookings: gateway)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('request-accept-b3')));
    await tester.pumpAndSettle();

    expect(find.text('انتهت مهلة هذا الطلب.'), findsOneWidget);
    expect(gateway.listCalls, 4);
  });

  testWidgets('empty inbox is explicit', (tester) async {
    final gateway = _BookingGateway(items: const []);
    await tester.pumpWidget(_app(ExpertRequestsScreen(bookings: gateway)));
    await tester.pumpAndSettle();

    expect(find.text('لا توجد طلبات معلقة حاليًا.'), findsOneWidget);
    expect(find.text('لا توجد حجوزات مقبولة بانتظار الدفع.'), findsOneWidget);
  });

  testWidgets('accepted bookings show read-only awaiting payment', (
    tester,
  ) async {
    final gateway = _BookingGateway(
      items: [
        _pending('b1'),
        _accepted('b9'),
      ],
    );
    await tester.pumpWidget(_app(ExpertRequestsScreen(bookings: gateway)));
    await tester.pumpAndSettle();

    expect(find.text('مقبول بانتظار الدفع'), findsOneWidget);
    expect(find.byKey(const ValueKey('accepted-b9')), findsOneWidget);
    expect(find.byKey(const ValueKey('request-accept-b9')), findsNothing);
  });
}

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

class _BookingGateway implements BookingGateway {
  _BookingGateway({required this.items, this.acceptError});

  List<Booking> items;
  final ApiFailure? acceptError;
  final accepted = <String>[];
  final rejected = <String>[];
  final rejectedReasons = <String?>[];
  int listCalls = 0;

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
    return CatalogPage(
      items: items.where((item) => status == null || item.status == status).toList(),
      page: 1,
      limit: 20,
      hasNext: false,
    );
  }

  @override
  Future<Booking> booking(String id) => throw UnimplementedError();

  @override
  Future<Booking> accept(String id) async {
    if (acceptError != null) throw acceptError!;
    accepted.add(id);
    items = items.where((item) => item.id != id).toList();
    return _pending(id);
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
}
