export const playAudio = async (base64Audio) => {
  const audio = new Audio(\`data:audio/mp3;base64,\${base64Audio}\`);
  await audio.play();
};

export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
