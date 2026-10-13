import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import 'api_failure.dart';
import 'app_config.dart';

abstract interface class ApiAuthenticator {
  Future<String?> accessToken();

  Future<String?> refreshAccessToken({String? failedAccessToken});

  Future<void> sessionExpired();
}

class ApiClient {
  ApiClient({
    required AppConfig config,
    Dio? dio,
    ApiAuthenticator? authenticator,
  }) : _authenticator = authenticator,
       _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl: config.apiBaseUrl,
               connectTimeout: const Duration(seconds: 10),
               sendTimeout: const Duration(seconds: 15),
               receiveTimeout: const Duration(seconds: 20),
               headers: const {'Accept': 'application/json'},
             ),
           );

  final Dio _dio;
  final ApiAuthenticator? _authenticator;

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'GET',
      path: path,
      query: query,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<List<int>> getBytes(
    String path, {
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request<List<int>>(
      method: 'GET',
      path: path,
      cancelToken: cancelToken,
      authenticated: authenticated,
      responseType: ResponseType.bytes,
    );
  }

  Future<T> post<T>(
    String path, {
    Object? data,
    CancelToken? cancelToken,
    bool authenticated = false,
    Map<String, String>? headers,
  }) {
    return _request(
      method: 'POST',
      path: path,
      data: data,
      cancelToken: cancelToken,
      authenticated: authenticated,
      headers: headers,
    );
  }

  Future<T> patch<T>(
    String path, {
    Object? data,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'PATCH',
      path: path,
      data: data,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> put<T>(
    String path, {
    Object? data,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'PUT',
      path: path,
      data: data,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> delete<T>(
    String path, {
    Object? data,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'DELETE',
      path: path,
      data: data,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> uploadBytes<T>(
    String path, {
    required String fieldName,
    required List<int> bytes,
    required String filename,
    required String contentType,
    Map<String, Object?>? fields,
    CancelToken? cancelToken,
    bool authenticated = true,
  }) {
    final fileBytes = List<int>.unmodifiable(bytes);
    final formFields = Map<String, Object?>.unmodifiable(
      fields ?? const <String, Object?>{},
    );
    final mediaType = MediaType.parse(contentType);
    FormData createFormData() => FormData.fromMap({
      ...formFields,
      fieldName: MultipartFile.fromBytes(
        fileBytes,
        filename: filename,
        contentType: mediaType,
      ),
    });

    return _request(
      method: 'POST',
      path: path,
      createData: createFormData,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> _request<T>({
    required String method,
    required String path,
    Object? data,
    Object? Function()? createData,
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
    bool authenticated = false,
    bool canRetry = true,
    bool retried = false,
    ResponseType? responseType,
    Map<String, String>? headers,
  }) async {
    final authenticator = _authenticator;
    final token = authenticated && authenticator != null
        ? await authenticator.accessToken()
        : null;
    final mergedHeaders = <String, Object?>{
      if (token != null) 'Authorization': 'Bearer $token',
      ...?headers,
    };
    try {
      final response = await _dio.request<T>(
        path,
        data: createData?.call() ?? data,
        queryParameters: query,
        cancelToken: cancelToken,
        options: Options(
          method: method,
          headers: mergedHeaders,
          responseType: responseType,
        ),
      );
      return response.data as T;
    } on DioException catch (error) {
      if (authenticated &&
          authenticator != null &&
          error.response?.statusCode == 401 &&
          retried) {
        await authenticator.sessionExpired();
      }
      if (authenticated &&
          authenticator != null &&
          error.response?.statusCode == 401 &&
          !retried) {
        final refreshed = await authenticator.refreshAccessToken(
          failedAccessToken: token,
        );
        if (refreshed == null) {
          await authenticator.sessionExpired();
        } else if (canRetry && !(cancelToken?.isCancelled ?? false)) {
          return _request<T>(
            method: method,
            path: path,
            data: data,
            createData: createData,
            query: query,
            cancelToken: cancelToken,
            authenticated: true,
            canRetry: canRetry,
            retried: true,
            responseType: responseType,
          );
        }
      }
      throw ApiFailure.fromDioException(error);
    }
  }
}
