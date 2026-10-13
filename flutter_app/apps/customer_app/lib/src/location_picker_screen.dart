import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

typedef LocationMapBuilder =
    Widget Function(
      BuildContext context,
      MapBounds bounds,
      LatLng? selectedPoint,
      ValueChanged<LatLng> onPointSelected,
    );

class LocationSelection {
  const LocationSelection({required this.lat, required this.lng});

  factory LocationSelection.fromPoint(LatLng point) => LocationSelection(
    lat: point.latitude.toStringAsFixed(6),
    lng: point.longitude.toStringAsFixed(6),
  );

  final String lat;
  final String lng;

  LatLng? toPoint() {
    final latitude = double.tryParse(lat);
    final longitude = double.tryParse(lng);
    if (latitude == null || longitude == null) return null;
    return LatLng(latitude, longitude);
  }
}

class LocationPickerScreen extends StatefulWidget {
  const LocationPickerScreen({
    required this.city,
    required this.mapConfiguration,
    this.initialSelection,
    this.mapBuilder,
    super.key,
  });

  final CatalogCity city;
  final PublicMapConfiguration mapConfiguration;
  final LocationSelection? initialSelection;
  final LocationMapBuilder? mapBuilder;

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  LatLng? _selectedPoint;

  MapBounds? get _bounds => widget.city.location.bounds;

  @override
  void initState() {
    super.initState();
    final point = widget.initialSelection?.toPoint();
    final bounds = _bounds;
    if (point != null &&
        bounds != null &&
        bounds.contains(point.latitude, point.longitude)) {
      _selectedPoint = point;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bounds = _bounds;
    return Scaffold(
      appBar: AppBar(title: Text(context.lamsa.chooseLocation)),
      body: SafeArea(
        child: bounds == null
            ? LamsaStatusView(
                status: LamsaStatus.error,
                title: context.lamsa.locationUnavailableTitle,
                message: context.lamsa.locationUnavailableMessage,
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: Text(context.lamsa.locationPickerInstructions),
                  ),
                  Expanded(
                    child: KeyedSubtree(
                      key: const Key('location-map'),
                      child:
                          widget.mapBuilder?.call(
                            context,
                            bounds,
                            _selectedPoint,
                            _selectPoint,
                          ) ??
                          _OpenStreetMap(
                            bounds: bounds,
                            configuration: widget.mapConfiguration,
                            selectedPoint: _selectedPoint,
                            onPointSelected: _selectPoint,
                          ),
                    ),
                  ),
                  if (_selectedPoint case final point?)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Text(
                        '${context.lamsa.latitude}: ${point.latitude.toStringAsFixed(6)}\n'
                        '${context.lamsa.longitude}: ${point.longitude.toStringAsFixed(6)}',
                        key: const Key('selected-coordinates'),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: LamsaButton(
                      key: const Key('confirm-location'),
                      label: context.lamsa.confirmLocation,
                      onPressed: _selectedPoint == null
                          ? null
                          : () => Navigator.pop(
                              context,
                              LocationSelection.fromPoint(_selectedPoint!),
                            ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  void _selectPoint(LatLng point) {
    final bounds = _bounds;
    if (bounds == null || !bounds.contains(point.latitude, point.longitude)) {
      return;
    }
    setState(() => _selectedPoint = point);
  }
}

class _OpenStreetMap extends StatelessWidget {
  const _OpenStreetMap({
    required this.bounds,
    required this.configuration,
    required this.selectedPoint,
    required this.onPointSelected,
  });

  final MapBounds bounds;
  final PublicMapConfiguration configuration;
  final LatLng? selectedPoint;
  final ValueChanged<LatLng> onPointSelected;

  @override
  Widget build(BuildContext context) {
    final mapBounds = LatLngBounds(
      LatLng(bounds.south, bounds.west),
      LatLng(bounds.north, bounds.east),
    );
    return FlutterMap(
      options: MapOptions(
        initialCameraFit: CameraFit.bounds(
          bounds: mapBounds,
          padding: const EdgeInsets.all(28),
          maxZoom: 16,
        ),
        minZoom: configuration.minZoom.toDouble(),
        maxZoom: configuration.maxZoom.toDouble(),
        cameraConstraint: CameraConstraint.containCenter(bounds: mapBounds),
        onTap: (_, point) => onPointSelected(point),
        onPositionChanged: (camera, hasGesture) {
          if (hasGesture) onPointSelected(camera.center);
        },
      ),
      children: [
        TileLayer(
          urlTemplate: configuration.tileUrlTemplate,
          userAgentPackageName: 'com.lamsa.lamsaCustomer',
          maxNativeZoom: configuration.maxZoom,
        ),
        if (selectedPoint != null)
          MarkerLayer(
            markers: [
              Marker(
                point: selectedPoint!,
                width: 48,
                height: 48,
                alignment: Alignment.topCenter,
                child: const Icon(
                  Icons.location_pin,
                  size: 48,
                  color: LamsaColors.plum,
                ),
              ),
            ],
          ),
        SimpleAttributionWidget(
          source: Text(context.lamsa.openStreetMapContributors),
          onTap: () => launchUrl(
            configuration.attributionUrl,
            mode: LaunchMode.externalApplication,
          ),
        ),
      ],
    );
  }
}
