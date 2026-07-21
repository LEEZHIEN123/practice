Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\leezh\Projects\practice\assets\images\discover-ai-coach.png'
$dstPath = 'C:\Users\leezh\Projects\practice\assets\images\discover-ai-coach-wide.png'

$src = [System.Drawing.Bitmap]::FromFile($srcPath)

# Vertical band that contains the whole robot (antenna to glow) plus bubbles.
$cropY = 200
$cropH = 780

# Widen to a 4:1 canvas (wider than the row card's ~3.7:1) so contentFit
# "cover" fits the full band height and the robot is never cropped.
# Right padding pushes the robot away from the card's right edge.
$newW = $cropH * 4
$padRightW = 300
$padW = $newW - $src.Width - $padRightW

$dst = New-Object System.Drawing.Bitmap($newW, $cropH)
$g = [System.Drawing.Graphics]::FromImage($dst)

$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Stretch a narrow slice of the source's left-edge gradient across the padded
# area so it blends smoothly with the original image.
$sliceW = 160
$sliceRect = New-Object System.Drawing.Rectangle(0, $cropY, $sliceW, $cropH)
$padRect = New-Object System.Drawing.Rectangle(0, 0, ($padW + $sliceW), $cropH)
$g.DrawImage($src, $padRect, $sliceRect, [System.Drawing.GraphicsUnit]::Pixel)

$srcRect = New-Object System.Drawing.Rectangle(0, $cropY, $src.Width, $cropH)
$dstRect = New-Object System.Drawing.Rectangle($padW, 0, $src.Width, $cropH)
$g.DrawImage($src, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

# Stretch a slice of the source's right-edge gradient across the right padding.
$rightSliceW = 40
$rightSliceRect = New-Object System.Drawing.Rectangle(($src.Width - $rightSliceW), $cropY, $rightSliceW, $cropH)
$rightPadRect = New-Object System.Drawing.Rectangle(($padW + $src.Width - 1), 0, ($padRightW + 1), $cropH)
$g.DrawImage($src, $rightPadRect, $rightSliceRect, [System.Drawing.GraphicsUnit]::Pixel)

$g.Dispose()
$dst.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
$src.Dispose()

Write-Output ("saved {0} ({1}x{2})" -f $dstPath, $newW, $cropH)
