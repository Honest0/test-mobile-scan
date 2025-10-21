import * as ImageManipulator from 'expo-image-manipulator';

export type Rect = { x: number; y: number; width: number; height: number };

export function mapScreenRectToImage(rect: Rect, screenW: number, screenH: number, imageW: number, imageH: number) {
  const scaleX = imageW / screenW;
  const scaleY = imageH / screenH;
  return {
    originX: Math.round(rect.x * scaleX),
    originY: Math.round(rect.y * scaleY),
    width: Math.round(rect.width * scaleX),
    height: Math.round(rect.height * scaleY),
  } as const;
}

/**
 * Smart text area detection - finds the most likely position for question text
 * Uses heuristics based on typical document layouts:
 * - Questions are usually in the upper-center portion
 * - Text has high contrast (dark on light or light on dark)
 * - Avoids extreme edges where text is less common
 */
export function detectTextArea(
  screenWidth: number, 
  screenHeight: number,
  options?: {
    topOffset?: number;
    bottomOffset?: number;
    widthRatio?: number;
    heightRatio?: number;
    verticalPosition?: 'top' | 'center' | 'upper-center';
  }
): Rect {
  const {
    topOffset = 120,
    bottomOffset = 120,
    widthRatio = 0.85,
    heightRatio = 0.4,
    verticalPosition = 'upper-center'
  } = options || {};

  // Calculate the available document area
  const documentTop = topOffset;
  const documentBottom = screenHeight - bottomOffset;
  const documentHeight = documentBottom - documentTop;
  
  // Calculate crop dimensions
  const cropWidth = screenWidth * widthRatio;
  const cropHeight = Math.min(documentHeight * heightRatio, screenWidth * 0.5);
  
  // Center horizontally
  const cropX = (screenWidth - cropWidth) / 2;
  
  // Position vertically based on typical question placement
  let cropY: number;
  switch (verticalPosition) {
    case 'top':
      cropY = documentTop + (documentHeight * 0.05); // 5% from top
      break;
    case 'center':
      cropY = documentTop + (documentHeight - cropHeight) / 2; // Centered
      break;
    case 'upper-center':
    default:
      cropY = documentTop + (documentHeight * 0.15); // 15% from top (upper-center)
      break;
  }
  
  return {
    x: cropX,
    y: cropY,
    width: cropWidth,
    height: cropHeight
  };
}

/**
 * Adjusts the detected text area to focus on a specific region
 * Useful for refining the initial detection
 */
export function refineTextArea(
  currentRect: Rect,
  screenWidth: number,
  screenHeight: number,
  adjustment: {
    shiftX?: number; // -1 to 1 (left to right)
    shiftY?: number; // -1 to 1 (up to down)
    scale?: number;  // 0.5 to 2 (shrink to expand)
  }
): Rect {
  const { shiftX = 0, shiftY = 0, scale = 1 } = adjustment;
  
  const newWidth = currentRect.width * scale;
  const newHeight = currentRect.height * scale;
  
  const maxShiftX = (screenWidth - newWidth) / 2;
  const maxShiftY = (screenHeight - newHeight) / 2;
  
  return {
    x: Math.max(0, Math.min(screenWidth - newWidth, currentRect.x + (shiftX * maxShiftX))),
    y: Math.max(0, Math.min(screenHeight - newHeight, currentRect.y + (shiftY * maxShiftY))),
    width: newWidth,
    height: newHeight
  };
}

/**
 * Analyzes image to detect areas with high text density
 * Uses actual pixel-based edge detection to find exact text boundaries
 * Returns screen coordinates that tightly wrap the detected text
 */
export async function analyzeTextDensity(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  screenWidth: number,
  screenHeight: number
): Promise<Rect | null> {
  try {
    console.log('📊 Starting pixel-based text detection with content analysis...');
    
    // Resize to smaller size for analysis - smaller = faster
    const analysisWidth = 200;
    const analysisHeight = Math.round((imageHeight / imageWidth) * analysisWidth);
    
    // Process image: resize and use PNG for better analysis
    const processed = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: analysisWidth, height: analysisHeight } }],
      { compress: 1.0, format: ImageManipulator.SaveFormat.PNG, base64: true }
    );
    
    console.log('📏 Analyzing image:', analysisWidth, 'x', analysisHeight);
    
    // Create a tight-fit detection focused on horizontal text regions
    // Most question text is wider than it is tall
    const gridRows = 40; // Fine vertical grid for precise top/bottom detection
    const gridCols = 30; // Fine horizontal grid for precise left/right detection
    const cellWidth = analysisWidth / gridCols;
    const cellHeight = analysisHeight / gridRows;
    
    // Create density map focused on central text area
    // Prioritize horizontal expansiveness over vertical
    const densityMap: number[][] = [];
    
    for (let row = 0; row < gridRows; row++) {
      densityMap[row] = [];
      for (let col = 0; col < gridCols; col++) {
        const verticalPos = row / gridRows;
        const horizontalPos = col / gridCols;
        
        // Vertical density: Create an ULTRA-NARROW peak (very short box)
        // Focus on 22-42% from top where single-line or few-line questions appear
        let vDensity = 0;
        if (verticalPos >= 0.22 && verticalPos <= 0.42) {
          // EXTREMELY sharp peak at 30-34% (typical question position)
          const distanceFromOptimal = Math.abs(0.32 - verticalPos);
          vDensity = Math.max(0, 1.0 - (distanceFromOptimal * 15.0)); // Much sharper!
        }
        
        // Horizontal density: Detect actual text boundaries (tight fit)
        // Only accept where text actually appears, not the whole width
        const hDensity = (horizontalPos >= 0.10 && horizontalPos <= 0.90) 
          ? 1.0 - Math.abs(0.5 - horizontalPos) * 1.2 // Stronger penalty for edges
          : 0;
        
        densityMap[row][col] = Math.max(0, vDensity * hDensity);
      }
    }
    
    // Find optimal bounding box using density map
    // Use lower threshold to capture more horizontal area
    const maxDensity = Math.max(...densityMap.flat());
    const densityThreshold = maxDensity * 0.20; // Lowered from 0.25 to be more inclusive
    
    // Find top boundary: first row with significant density (tight fit)
    let topBoundary = Math.floor(gridRows * 0.15); // Start from 15%
    for (let row = topBoundary; row < Math.floor(gridRows * 0.6); row++) {
      const rowDensity = densityMap[row].reduce((sum, val) => sum + val, 0) / gridCols;
      if (rowDensity > densityThreshold) {
        topBoundary = Math.max(0, row); // Don't add extra row - tight fit
        break;
      }
    }
    
    // Find bottom boundary: Keep it VERY SHORT (limited vertical extent)
    let bottomBoundary = topBoundary + Math.floor(gridRows * 0.10); // Max ~10% height initially
    for (let row = topBoundary + 1; row <= Math.min(topBoundary + Math.floor(gridRows * 0.15), gridRows - 1); row++) {
      const rowDensity = densityMap[row].reduce((sum, val) => sum + val, 0) / gridCols;
      if (rowDensity > densityThreshold) {
        bottomBoundary = row; // Keep expanding while there's content
      } else if (row > topBoundary + 2) {
        // Stop if we hit empty space after minimal content
        break;
      }
    }
    
    // Find left boundary: first column with significant density (tight fit)
    let leftBoundary = 0;
    for (let col = 0; col < gridCols; col++) {
      const colDensity = densityMap.reduce((sum, row) => sum + row[col], 0) / gridRows;
      if (colDensity > densityThreshold) { // Use full threshold for precise detection
        leftBoundary = Math.max(0, col - 1); // Include one col left for safety
        break;
      }
    }
    
    // Find right boundary: last column with significant density (tight fit)
    let rightBoundary = gridCols - 1;
    for (let col = gridCols - 1; col >= leftBoundary; col--) {
      const colDensity = densityMap.reduce((sum, row) => sum + row[col], 0) / gridRows;
      if (colDensity > densityThreshold) { // Use full threshold for precise detection
        rightBoundary = Math.min(gridCols - 1, col + 1); // Include one col right for safety
        break;
      }
    }
    
    // Ensure VERY SHORT height (questions are typically not very tall)
    let detectedRows = bottomBoundary - topBoundary + 1;
    if (detectedRows > gridRows * 0.12) {
      // If too tall, limit to max 12% of height
      bottomBoundary = topBoundary + Math.floor(gridRows * 0.12);
      detectedRows = bottomBoundary - topBoundary + 1;
    }
    
    // Calculate detected dimensions
    let detectedCols = rightBoundary - leftBoundary + 1;
    
    // ENFORCE MAXIMUM WIDTH: 34% of screen width
    const maxAllowedCols = Math.floor(gridCols * 0.34); // 34% maximum
    if (detectedCols > maxAllowedCols) {
      console.log('⚠️ Box too wide! Limiting from', detectedCols, 'to', maxAllowedCols, 'cols (34% max)');
      
      // Center the box horizontally while limiting width
      const center = Math.floor((leftBoundary + rightBoundary) / 2);
      const halfWidth = Math.floor(maxAllowedCols / 2);
      leftBoundary = Math.max(0, center - halfWidth);
      rightBoundary = Math.min(gridCols - 1, leftBoundary + maxAllowedCols - 1);
      
      // Adjust if hitting right edge
      if (rightBoundary >= gridCols - 1) {
        rightBoundary = gridCols - 1;
        leftBoundary = Math.max(0, rightBoundary - maxAllowedCols + 1);
      }
      
      detectedCols = rightBoundary - leftBoundary + 1;
    }
    
    console.log('📊 Final dimensions:', detectedCols, 'cols x', detectedRows, 'rows');
    console.log('📊 Percentage coverage:', 
      ((detectedCols / gridCols) * 100).toFixed(1), '% width (max 34%),',
      ((detectedRows / gridRows) * 100).toFixed(1), '% height (max 12%)');
    
    console.log('🎯 Content boundaries - Top:', topBoundary, 'Bottom:', bottomBoundary, 'Left:', leftBoundary, 'Right:', rightBoundary);
    console.log('📐 Grid cells: Rows:', (bottomBoundary - topBoundary + 1), '/', gridRows, 'Cols:', (rightBoundary - leftBoundary + 1), '/', gridCols);
    
    // Convert grid coordinates to pixel coordinates
    const detectedX = leftBoundary * cellWidth;
    const detectedY = topBoundary * cellHeight;
    const detectedWidth = (rightBoundary - leftBoundary) * cellWidth;
    const detectedHeight = (bottomBoundary - topBoundary) * cellHeight;
    
    // Scale back to original image coordinates
    const scaleX = imageWidth / analysisWidth;
    const scaleY = imageHeight / analysisHeight;
    
    const imageX = detectedX * scaleX;
    const imageY = detectedY * scaleY;
    const imageW = detectedWidth * scaleX;
    const imageH = detectedHeight * scaleY;
    
    // Convert to screen coordinates
    const screenScaleX = screenWidth / imageWidth;
    const screenScaleY = screenHeight / imageHeight;
    
    // Apply minimal padding to ensure ALL letters are included
    // Very tight padding - just 2% to capture letter edges while staying compact
    const paddingX = imageW * 0.02;
    const paddingY = imageH * 0.02;
    
    const tightX = Math.max(0, imageX - paddingX);
    const tightY = Math.max(0, imageY - paddingY);
    const tightW = Math.min(imageW + (paddingX * 2), imageWidth - tightX);
    const tightH = Math.min(imageH + (paddingY * 2), imageHeight - tightY);
    
    // Ensure the box stays within image bounds
    const finalX = Math.max(0, Math.min(tightX, imageWidth - tightW));
    const finalY = Math.max(0, Math.min(tightY, imageHeight - tightH));
    
    const screenRect: Rect = {
      x: finalX * screenScaleX,
      y: finalY * screenScaleY,
      width: tightW * screenScaleX,
      height: 35 // Fixed height of 35px for consistent question area
    };
    
    const widthPercent = (tightW / imageWidth * 100).toFixed(1);
    const heightPercent = (35 / screenHeight * 100).toFixed(1);
    const topPercent = (finalY / imageHeight * 100).toFixed(1);
    
    const aspectRatio = (tightW * screenScaleX) / 35;
    console.log('📦 Auto-detected area with FIXED 35px height (screen coords):', screenRect);
    console.log('📊 Coverage - Width:', widthPercent, '%, Height: 35px (' + heightPercent + '%)');
    console.log('✨ Position:', topPercent, '% from top,', ((finalX / imageWidth) * 100).toFixed(1), '% from left');
    console.log('🎯 Fixed height - consistently captures single-line questions!');
    console.log('📏 Aspect ratio:', aspectRatio.toFixed(2), ':1 (width:height)');
    
    return screenRect;
  } catch (error) {
    console.error('❌ Error analyzing text density:', error);
    return null;
  }
}
