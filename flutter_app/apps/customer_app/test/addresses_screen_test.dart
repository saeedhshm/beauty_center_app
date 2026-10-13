import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/addresses_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

void main() {
  testWidgets('addresses show empty state', (tester) async {
    final gateway = FakeAddressGateway(pages: {1: addressPage(const [])});
    await tester.pumpWidget(
      testApp(
        AddressesScreen(gateway: gateway, catalogGateway: FakeCitiesGateway()),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      tester.widget<LamsaStatusView>(find.byType(LamsaStatusView)).status,
      LamsaStatus.empty,
    );
  });

  testWidgets('addresses append the next page', (tester) async {
    final gateway = FakeAddressGateway(
      pages: {
        1: addressPage([address('a1', 'First')], hasNext: true),
        2: addressPage([address('a2', 'Second')], page: 2),
      },
    );
    await tester.pumpWidget(
      testApp(
        AddressesScreen(gateway: gateway, catalogGateway: FakeCitiesGateway()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('addresses-load-more')));
    await tester.pumpAndSettle();

    expect(find.text('First'), findsOneWidget);
    expect(find.text('Second'), findsOneWidget);
    expect(gateway.listedPages, [1, 2]);
  });

  testWidgets('address form validates and explicitly clears coordinates', (
    tester,
  ) async {
    final gateway = FakeAddressGateway(pages: const {});
    await tester.pumpWidget(
      testApp(
        AddressFormScreen(
          gateway: gateway,
          cities: const [
            CatalogCity(id: 1, name: 'Test city', code: 'TEST', isActive: true),
          ],
          address: const CustomerAddress(
            id: 'a1',
            label: 'Home',
            addressText: 'Long existing address',
            cityId: 1,
            lat: '30.1',
            lng: '31.2',
            isDefault: false,
          ),
        ),
      ),
    );

    await tester.enterText(find.byKey(const Key('address-label')), '');
    final saveButton = find.byKey(const Key('save-address'));
    await tester.ensureVisible(saveButton);
    await tester.tap(saveButton);
    await tester.pump();
    expect(gateway.updatedDraft, isNull);
    expect(gateway.updateCalls, 0);

    await tester.enterText(find.byKey(const Key('address-label')), 'Home');
    await tester.enterText(find.byKey(const Key('address-lat')), '');
    await tester.enterText(find.byKey(const Key('address-lng')), '');
    await tester.ensureVisible(saveButton);
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(gateway.updateCalls, 1);
    expect(gateway.updatedDraft, isNotNull);
    expect(gateway.updatedDraft!.includeCoordinates, isTrue);
    expect(gateway.updatedDraft!.lat, isNull);
    expect(gateway.updatedDraft!.lng, isNull);
  });

  testWidgets('address form rejects coordinate formats outside API contract', (
    tester,
  ) async {
    final gateway = FakeAddressGateway(pages: const {});
    await tester.pumpWidget(
      testApp(
        AddressFormScreen(
          gateway: gateway,
          cities: const [
            CatalogCity(id: 1, name: 'Test city', code: 'TEST', isActive: true),
          ],
        ),
      ),
    );
    await tester.enterText(find.byKey(const Key('address-label')), 'Home');
    await tester.enterText(
      find.byKey(const Key('address-text')),
      'A valid detailed address',
    );
    await tester.enterText(find.byKey(const Key('address-lat')), '3e1');
    await tester.enterText(find.byKey(const Key('address-lng')), '31.1234567');
    final saveButton = find.byKey(const Key('save-address'));
    await tester.ensureVisible(saveButton);
    await tester.tap(saveButton);
    await tester.pump();

    expect(gateway.createCalls, 0);
    expect(find.textContaining('between'), findsNWidgets(2));
  });
}

Widget testApp(Widget child) => MaterialApp(
  locale: const Locale('en'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  theme: LamsaTheme.light(),
  home: child,
);

CustomerAddress address(String id, String label) => CustomerAddress(
  id: id,
  label: label,
  addressText: 'Test address text',
  cityId: 1,
  lat: null,
  lng: null,
  isDefault: false,
);

CatalogPage<CustomerAddress> addressPage(
  List<CustomerAddress> items, {
  int page = 1,
  bool hasNext = false,
}) => CatalogPage(items: items, page: page, limit: 20, hasNext: hasNext);

class FakeAddressGateway implements AddressGateway {
  FakeAddressGateway({required this.pages});

  final Map<int, CatalogPage<CustomerAddress>> pages;
  final listedPages = <int>[];
  int updateCalls = 0;
  int createCalls = 0;
  AddressDraft? updatedDraft;

  @override
  Future<CatalogPage<CustomerAddress>> list({
    int page = 1,
    int limit = 20,
  }) async {
    listedPages.add(page);
    return pages[page] ?? addressPage(const []);
  }

  @override
  Future<CustomerAddress> create({
    required String label,
    required String addressText,
    required int cityId,
    String? lat,
    String? lng,
    bool isDefault = false,
  }) async {
    createCalls++;
    return CustomerAddress(
      id: 'created',
      label: label,
      addressText: addressText,
      cityId: cityId,
      lat: lat,
      lng: lng,
      isDefault: isDefault,
    );
  }

  @override
  Future<void> delete(String id) async {}

  @override
  Future<CustomerAddress> update(String id, AddressDraft input) async {
    updateCalls++;
    updatedDraft = input;
    return CustomerAddress(
      id: id,
      label: input.label ?? 'Home',
      addressText: input.addressText ?? 'Test address text',
      cityId: input.cityId ?? 1,
      lat: input.lat,
      lng: input.lng,
      isDefault: input.isDefault ?? false,
    );
  }
}

class FakeCitiesGateway implements CatalogGateway {
  @override
  Future<List<CatalogCity>> cities() async => const [
    CatalogCity(id: 1, name: 'Test city', code: 'TEST', isActive: true),
  ];

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

  @override
  Future<CatalogPage<CatalogService>> services({
    int page = 1,
    int limit = 20,
  }) => throw UnimplementedError();
}
