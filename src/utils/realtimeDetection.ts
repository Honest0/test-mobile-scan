/**
 * Lightweight real-time detection for camera preview frames
 * Optimized for speed over accuracy - runs at 2-4 fps
 */

export type DetectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Simple heuristic-based detection for real-time preview
 * Uses geometric heuristics optimized for question detection
 * Much faster than full image processing
 */
export function detectQuestionAreaFast(
  previewWidth: number,
  previewHeight: number,
  options?: {
    verticalBias?: number; // 0-1, where in vertical space to center (0.3 = upper third)
    widthRatio?: number;   // 0-1, how wide the box should be
    heightRatio?: number;  // 0-1, how tall the box should be
  }
): DetectionRect {
  const {
    verticalBias = 0.18,  // Position at ~18% from top (questions are usually in upper area)
    widthRatio = 0.65,    // 65% of preview width (most questions don't span full width)
    heightRatio = 0.10,   // 10% of preview height (compact for single-line questions)
  } = options || {};

  // Calculate box dimensions
  const boxWidth = previewWidth * widthRatio;
  const boxHeight = Math.min(previewHeight * heightRatio, 100); // Max 100px height

  // Center horizontally
  const boxX = (previewWidth - boxWidth) / 2;
  
  // Position vertically based on typical question placement
  const boxY = (previewHeight * verticalBias) - (boxHeight / 2);

  // Ensure box stays within bounds
  const clampedX = Math.max(0, Math.min(boxX, previewWidth - boxWidth));
  const clampedY = Math.max(0, Math.min(boxY, previewHeight - boxHeight));

  return {
    x: clampedX,
    y: clampedY,
    width: boxWidth,
    height: boxHeight,
  };
}

/**
 * Smoothly interpolate between old and new detection box (lerp)
 * Prevents jittery box movement
 */
export function smoothBoxTransition(
  currentBox: DetectionRect | null,
  newBox: DetectionRect,
  smoothingFactor: number = 0.3 // 0 = no smoothing, 1 = instant
): DetectionRect {
  if (!currentBox) {
    return newBox;
  }

  return {
    x: currentBox.x + (newBox.x - currentBox.x) * smoothingFactor,
    y: currentBox.y + (newBox.y - currentBox.y) * smoothingFactor,
    width: currentBox.width + (newBox.width - currentBox.width) * smoothingFactor,
    height: currentBox.height + (newBox.height - currentBox.height) * smoothingFactor,
  };
}

/**
 * Maps detected box from preview coordinates to image coordinates
 * Used when capturing to crop the actual high-res image
 */
export function mapPreviewBoxToImageCoords(
  previewBox: DetectionRect,
  previewWidth: number,
  previewHeight: number,
  imageWidth: number,
  imageHeight: number
): { originX: number; originY: number; width: number; height: number } {
  const scaleX = imageWidth / previewWidth;
  const scaleY = imageHeight / previewHeight;

  return {
    originX: Math.round(previewBox.x * scaleX),
    originY: Math.round(previewBox.y * scaleY),
    width: Math.round(previewBox.width * scaleX),
    height: Math.round(previewBox.height * scaleY),
  };
}

/**
 * Validates that a detection box is within valid bounds
 */
export function isValidBox(
  box: DetectionRect,
  containerWidth: number,
  containerHeight: number
): boolean {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x + box.width <= containerWidth &&
    box.y + box.height <= containerHeight
  );
}

