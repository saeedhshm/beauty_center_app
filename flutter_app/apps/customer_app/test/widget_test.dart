import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/app.dart';

void main() {
  testWidgets('anonymous customer sees real auth choices in RTL', (
    tester,
  ) async {
    final manager = await anonymousManager(AuthRole.customer);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionManagerProvider.overrideWithValue(manager),
          networkStateProvider.overrideWith((ref) => Stream.value(true)),
        ],
        child: const CustomerApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('تسجيل الدخول'), findsWidgets);
    expect(find.text('إنشاء حساب'), findsOneWidget);
    expect(find.text('نسيت كلمة المرور'), findsOneWidget);
  });

  testWidgets('authenticated customer can open her preserved account profile', (
    tester,
  ) async {
    final manager = await authenticatedManager(AuthRole.customer);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionManagerProvider.overrideWithValue(manager),
          accountApiProvider.overrideWithValue(
            FakeAccountGateway(manager.user!),
          ),
          catalogApiProvider.overrideWithValue(FakeCatalogGateway()),
          addressApiProvider.overrideWithValue(FakeAddressGateway()),
          networkStateProvider.overrideWith((ref) => Stream.value(true)),
        ],
        child: const CustomerApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('الحساب'));
    await tester.pumpAndSettle();

    expect(find.text('الملف الشخصي'), findsOneWidget);
    expect(find.text('+201012345678'), findsOneWidget);
    expect(find.text('تسجيل الخروج'), findsOneWidget);
  });
}

Future<SessionManager> anonymousManager(AuthRole role) async {
  final manager = SessionManager(
    expectedRole: role,
    gateway: FakeGateway(role),
    store: MemorySessionStore(),
  );
  await manager.bootstrap();
  return manager;
}

Future<SessionManager> authenticatedManager(AuthRole role) async {
  final gateway = FakeGateway(role);
  final manager = SessionManager(
    expectedRole: role,
    gateway: gateway,
    store: MemorySessionStore(),
  );
  await manager.login(phone: '01012345678', password: 'password-1234');
  return manager;
}

class FakeGateway implements AuthGateway {
  FakeGateway(this.role);
  final AuthRole role;

  AuthSession get value => AuthSession(
    user: AuthUser(
      id: '00000000-0000-4000-8000-000000000001',
      name: 'عميلة اختبار',
      phone: '+201012345678',
      role: role,
      phoneVerified: true,
    ),
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
  );

  @override
  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async => value;
  @override
  Future<void> logout(String refreshToken) async {}
  @override
  Future<AuthSession> refresh(String refreshToken) async => value;
  @override
  Future<AuthSession> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
    required AuthRole role,
  }) async => value;
  @override
  Future<OtpChallenge> requestPasswordOtp(String phone) =>
      throw UnimplementedError();
  @override
  Future<OtpChallenge> requestRegistrationOtp(String phone) =>
      throw UnimplementedError();
  @override
  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  }) async {}
}

class FakeAccountGateway implements AccountGateway {
  FakeAccountGateway(this.user);
  AuthUser user;
  @override
  Future<AuthUser> currentUser() async => user;
  @override
  Future<AuthUser> updateName(String name) async => user;
}

class FakeCatalogGateway implements CatalogGateway {
  @override
  Future<PublicMapConfiguration> mapConfiguration() =>
      throw UnimplementedError();

  @override
  Future<List<CatalogCity>> cities() async => const [
    CatalogCity(id: 1, name: 'مدينة اختبار', code: 'TEST', isActive: true),
  ];

  @override
  Future<CatalogPage<CatalogService>> services({
    int page = 1,
    int limit = 20,
  }) async => const CatalogPage(items: [], page: 1, limit: 20, hasNext: false);

  @override
  Future<CatalogPage<PublicExpert>> experts({
    int page = 1,
    int limit = 20,
    int? cityId,
    int? serviceId,
    String? q,
    ExpertSort sort = ExpertSort.nameAsc,
  }) async => const CatalogPage(items: [], page: 1, limit: 20, hasNext: false);

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

class FakeAddressGateway implements AddressGateway {
  @override
  Future<CatalogPage<CustomerAddress>> list({
    int page = 1,
    int limit = 20,
  }) async => const CatalogPage(items: [], page: 1, limit: 20, hasNext: false);

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
  Future<void> delete(String id) => throw UnimplementedError();

  @override
  Future<CustomerAddress> update(String id, AddressDraft input) =>
      throw UnimplementedError();
}
