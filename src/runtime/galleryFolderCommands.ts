import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isGalleryFolderRuntimeAvailable };

export type GalleryFolderImagesResult = {
  folderPath: string;
  imagePaths: string[];
};

export function listGalleryFolderImages(folderPath: string) {
  return invokeTauriCommand<GalleryFolderImagesResult>(
    "gallery_folder_images_list",
    { folderPath },
  );
}
