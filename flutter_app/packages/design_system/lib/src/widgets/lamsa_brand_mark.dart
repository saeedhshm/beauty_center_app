import 'package:flutter/material.dart';

import '../foundation/lamsa_colors.dart';

class LamsaBrandMark extends StatelessWidget {
  const LamsaBrandMark({
    super.key,
    this.size = 64,
    this.foreground = LamsaColors.cream,
  });

  final double size;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'لمسة',
      image: true,
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [LamsaColors.rose, LamsaColors.plum],
          ),
          borderRadius: BorderRadius.only(
            topRight: Radius.circular(size * .42),
            topLeft: Radius.circular(size * .25),
            bottomRight: Radius.circular(size * .26),
            bottomLeft: Radius.circular(size * .44),
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x337A1F58),
              blurRadius: 24,
              offset: Offset(0, 10),
            ),
          ],
        ),
        child: Text(
          'ل',
          style: TextStyle(
            color: foreground,
            fontSize: size * .48,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}
