
from PIL import Image, ImageDraw

def create_test_image():
    """Creates a simple 96x96 test image with a colored pattern."""
    width, height = 96, 96
    img = Image.new('RGB', (width, height), color = '#1E1E1E')
    draw = ImageDraw.Draw(img)

    # Draw a pattern
    draw.rectangle([10, 10, width-10, height-10], fill='#33A1FF')
    draw.rectangle([25, 25, width-25, height-25], fill='#FFFFFF')
    draw.line([0, 0, width, height], fill='#FF5733', width=5)
    draw.line([0, height, width, 0], fill='#FF5733', width=5)

    output_path = "pc_software/test_icon.jpg"
    img.save(output_path, 'JPEG')
    print(f"Test image saved to {output_path}")

if __name__ == "__main__":
    create_test_image()
