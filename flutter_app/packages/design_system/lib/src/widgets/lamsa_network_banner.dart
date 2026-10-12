import 'package:flutter/material.dart';

import '../foundation/lamsa_colors.dart';

class LamsaNetworkBanner extends StatelessWidget {
  const LamsaNetworkBanner({
    required this.isOnline,
    required this.child,
    super.key,
  });

  final bool? isOnline;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: isOnline == false
              ? Container(
                  key: const ValueKey('offline'),
                  width: double.infinity,
                  color: LamsaColors.warning,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: const SafeArea(
                    bottom: false,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.wifi_off_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                        SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            'لا يوجد اتصال بالشبكة',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              : const SizedBox.shrink(key: ValueKey('online')),
        ),
        Expanded(child: child),
      ],
    );
  }
}
