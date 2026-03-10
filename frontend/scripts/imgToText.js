import { userMessageImg } from './chatbot.js';

const fileInput       = document.getElementById("file-input");
const preview         = document.getElementById("preview");
const fileName        = document.getElementById("file-name");
const sendBtn         = document.getElementById("send-btn");
const previewContainer = document.querySelector(".file-preview-wrapper-container");

let selectedFile = null;

// ── Exposed so chatbot.js can grab it during handleSend ──
export function getSelectedFile() { return selectedFile; }
export function clearSelectedFile() {
  selectedFile    = null;
  fileInput.value = null;
  preview.src     = "";
  fileName.textContent = "";
  previewContainer.style.display = "none";
}

fileInput.addEventListener("click", () => {
  fileInput.value = "";
});

fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files[0];
  if (!selectedFile) return;

  previewContainer.style.display = "flex";
  fileName.textContent = selectedFile.name;
  preview.src = selectedFile.type.startsWith("image/")
    ? URL.createObjectURL(selectedFile)
    : "../../img/file.jpg";
});

// ── Extract text from file — returns string, does NOT send ──
export async function extractFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (file.type.startsWith("image/")) {
      reader.onload = async () => {
        try {
          const text = await runOCR(reader.result);
          resolve({ type: "image", text, objectUrl: URL.createObjectURL(file) });
        } catch (err) { reject(err); }
      };
      reader.readAsDataURL(file);

    } else if (file.type === "application/pdf") {
      reader.onload = async () => {
        try {
          const typedarray = new Uint8Array(reader.result);
          const pdf  = await pdfjsLib.getDocument(typedarray).promise;
          let   text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page    = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(" ") + "\n\n";
          }
          resolve({ type: "pdf", text });
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);

    } else if (file.name.endsWith(".docx")) {
      reader.onload = async () => {
        try {
          const result = await mammoth.extractRawText({ arrayBuffer: reader.result });
          resolve({ type: "docx", text: result.value });
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);

    } else if (file.type === "text/plain") {
      reader.onload = () => resolve({ type: "txt", text: reader.result });
      reader.readAsText(file);

    } else {
      reject(new Error("Unsupported file type!"));
    }
  });
}

async function runOCR(base64Image) {
  const worker = await Tesseract.createWorker();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  await worker.setParameters({
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?()'\"-:/ ",
    preserve_interword_spaces: "1"
  });
  const { data } = await worker.recognize(base64Image);
  await worker.terminate();
  return data.text.replace(/\n+/g, "\n").replace(/[ ]{2,}/g, " ").trim();
}

// ── Remove button handler ──
const removeBtn = document.getElementById("remove-file-btn");
removeBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  clearSelectedFile();
});