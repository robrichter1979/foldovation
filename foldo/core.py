import ast
import json
import os

import cv2
import numpy as np
from docx import Document
from docx.shared import Inches


def convert_keys(obj):
    if isinstance(obj, dict):
        return {str(k): convert_keys(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_keys(i) for i in obj]
    return obj


def restore_tuples(obj):
    if isinstance(obj, dict):
        return {
            k: tuple(v) if k == "position" and isinstance(v, list) else restore_tuples(v)
            for k, v in obj.items()
        }
    elif isinstance(obj, list):
        return [restore_tuples(i) for i in obj]
    return obj


def divide_image_into_triangles(image, diagonal=True):
    height, width, channels = image.shape
    if height != width:
        raise ValueError("The image is not square!")

    if diagonal:
        points1 = np.array([[0, 0], [width, height], [width, 0]], np.int32)
        points2 = np.array([[0, 0], [width, height], [0, height]], np.int32)

    if not diagonal:
        points1 = np.array([[0, 0], [width, 0], [0, height]], np.int32)
        points2 = np.array([[width, 0], [0, height], [width, height]], np.int32)

    mask1 = np.zeros((height, width), dtype=np.uint8)
    mask2 = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(mask1, points1, 255)
    cv2.fillConvexPoly(mask2, points2, 255)

    upper_triangle = cv2.bitwise_and(image, image, mask=mask1)
    lower_triangle = cv2.bitwise_and(image, image, mask=mask2)

    return upper_triangle, lower_triangle


def extract_all_squares_from_image(image, splits):
    height, width, _ = image.shape

    if height != width:
        raise ValueError("The image is not square!")
    if height % splits != 0:
        raise ValueError("The square size is not divisible by the number of squares evenly!")

    square_size = height // splits

    image_split_dict = dict()
    for i in range(splits):
        for j in range(splits):
            x_start = j * square_size
            y_start = i * square_size
            square_image = image[y_start:y_start + square_size, x_start:x_start + square_size]
            image_split_dict.update({(i, j): square_image})
    return image_split_dict


def combine_to_final_image_new(mapping_dict, image_mapping, splits=8, original_splits=4):
    rotation_mapping = {
        -1: cv2.ROTATE_90_COUNTERCLOCKWISE,
         0: cv2.ROTATE_180,
         1: cv2.ROTATE_90_CLOCKWISE,
    }

    original_square_images = extract_all_squares_from_image(image_mapping.get('original'), original_splits)
    final_square_image_dict = dict()
    row_image_dict = dict()

    for i in range(splits):
        for j in range(splits):
            square_image_dict = mapping_dict.get((i, j))
            key = list(square_image_dict.keys())[0]

            if key == 'full_square':
                flipping_value = square_image_dict['full_square'].get('flipped')
                rotation_value = square_image_dict['full_square'].get('rotated')
                image_type = square_image_dict['full_square'].get('image_type')
                if image_type in ('hidden', 'background'):
                    square_image = image_mapping.get(image_type)
                elif image_type == 'original':
                    square_image = original_square_images.get(square_image_dict['full_square'].get('position'))
                else:
                    raise ValueError("Mapping dictionary contains non valid key!")

            elif key == 'triangles':
                flipping_value = square_image_dict['triangles'].get('flipped')
                rotation_value = square_image_dict['triangles'].get('rotated')
                main_diagonal_choice = square_image_dict['triangles'].get('diagonal')

                upper_type = square_image_dict['triangles']['image_upper']['image_type']
                if upper_type in ('hidden', 'background'):
                    upper_triangle, _ = divide_image_into_triangles(
                        image_mapping.get(upper_type), main_diagonal_choice)
                elif upper_type == 'original':
                    relevant_square = original_square_images.get(
                        square_image_dict['triangles']['image_upper']['position'])
                    upper_triangle, _ = divide_image_into_triangles(relevant_square, main_diagonal_choice)
                else:
                    raise ValueError("Mapping dictionary contains non valid key!")

                lower_type = square_image_dict['triangles']['image_lower']['image_type']
                if lower_type in ('hidden', 'background'):
                    _, lower_triangle = divide_image_into_triangles(
                        image_mapping.get(lower_type), main_diagonal_choice)
                elif lower_type == 'original':
                    relevant_square = original_square_images.get(
                        square_image_dict['triangles']['image_lower']['position'])
                    _, lower_triangle = divide_image_into_triangles(relevant_square, main_diagonal_choice)
                else:
                    raise ValueError("Mapping dictionary contains non valid key!")

                square_image = cv2.bitwise_or(upper_triangle, lower_triangle)

            if flipping_value is not None:
                square_image = cv2.flip(square_image, flipping_value)
            if rotation_value in (-1, 0, 1):
                square_image = cv2.rotate(square_image, rotation_mapping[rotation_value])

            final_square_image_dict[(i, j)] = square_image

        row_image_dict[i] = cv2.hconcat([final_square_image_dict[(i, m)] for m in range(splits)])

    return cv2.vconcat([row_image_dict[i] for i in range(splits)])


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate a single foldo image.")
    parser.add_argument("--image", default="image_data/square_image.jpg",
                        help="Path to the original square image (default: image_data/square_image.jpg)")
    parser.add_argument("--mapping", default="mapping_001_new",
                        help="Mapping name to use (default: mapping_001_new)")
    parser.add_argument("--output", default="image_data/test_final_image/final_foldo_image.jpeg",
                        help="Path and filename for the output image")
    args = parser.parse_args()

    with open("mappings/all_foldo_mappings_v1.json", "r") as f:
        loaded = restore_tuples(json.load(f))

    all_foldo_mappings = {
        mapping_name: {ast.literal_eval(k): v for k, v in mapping.items()}
        for mapping_name, mapping in loaded.items()
    }

    available_mappings = list(all_foldo_mappings.keys())
    if args.mapping not in all_foldo_mappings:
        print(f"Error: mapping '{args.mapping}' not found. Available mappings: {available_mappings}")
        return

    hidden_image = cv2.imread('image_data/hidden_v3.png')
    background_image = cv2.imread('image_data/background_v4.png')

    test_image = cv2.imread(args.image)
    if test_image is None:
        print(f"Error: could not load image '{args.image}'")
        return
    resized_image = cv2.resize(test_image, (400, 400), interpolation=cv2.INTER_LINEAR)

    image_mapping_new = {
        'hidden': hidden_image,
        'background': background_image,
        'original': resized_image,
    }

    chosen_mapping = all_foldo_mappings.get(args.mapping)
    combined_final_image_new = combine_to_final_image_new(chosen_mapping, image_mapping_new)

    foldo_image_filename = args.output
    os.makedirs(os.path.dirname(foldo_image_filename) or '.', exist_ok=True)
    cv2.imwrite(foldo_image_filename, combined_final_image_new)

    docx_filename = os.path.splitext(foldo_image_filename)[0] + '.docx'
    document = Document()
    document.add_picture(foldo_image_filename, width=Inches(5.5))
    document.save(docx_filename)

    print("Done. Saved image and docx.")


if __name__ == "__main__":
    main()
