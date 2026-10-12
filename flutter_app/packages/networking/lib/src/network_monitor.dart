import 'package:connectivity_plus/connectivity_plus.dart';

class NetworkMonitor {
  NetworkMonitor({Connectivity? connectivity})
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  Stream<bool> get changes =>
      _connectivity.onConnectivityChanged.map(_hasConnection).distinct();

  Future<bool> get isConnected async =>
      _hasConnection(await _connectivity.checkConnectivity());

  bool _hasConnection(List<ConnectivityResult> results) {
    return results.isNotEmpty &&
        results.any((result) => result != ConnectivityResult.none);
  }
}
