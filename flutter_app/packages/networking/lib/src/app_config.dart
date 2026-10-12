enum AppEnvironment { development, staging, production }

class AppConfig {
  const AppConfig({required this.environment, required this.apiBaseUrl});

  factory AppConfig.fromDartDefines() {
    const environmentValue = String.fromEnvironment(
      'APP_ENV',
      defaultValue: 'development',
    );
    final environment = switch (environmentValue) {
      'development' => AppEnvironment.development,
      'staging' => AppEnvironment.staging,
      'production' => AppEnvironment.production,
      _ => throw StateError(
        'APP_ENV must be development, staging, or production',
      ),
    };
    const configuredUrl = String.fromEnvironment('API_BASE_URL');
    final url = configuredUrl.isNotEmpty
        ? configuredUrl
        : environment == AppEnvironment.development
        ? 'http://127.0.0.1:3000'
        : throw StateError('API_BASE_URL is required outside development');
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme || !uri.hasAuthority) {
      throw StateError('API_BASE_URL must be an absolute URL');
    }
    if (environment != AppEnvironment.development && uri.scheme != 'https') {
      throw StateError('API_BASE_URL must use HTTPS outside development');
    }
    return AppConfig(
      environment: environment,
      apiBaseUrl: url.replaceFirst(RegExp(r'/$'), ''),
    );
  }

  final AppEnvironment environment;
  final String apiBaseUrl;

  String get label => switch (environment) {
    AppEnvironment.development => 'بيئة التطوير',
    AppEnvironment.staging => 'بيئة التجربة',
    AppEnvironment.production => 'الإنتاج',
  };
}
