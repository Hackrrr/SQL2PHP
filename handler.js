let el_files, el_generate, el_copy, el_download, el_downloadAll, el_input, el_messageHolder, el_messageText;
let input = "";
/** @type {?OutputFile} */
let currentFile = null;
/** @type {OutputFile[]|null} */
let lastOutput = null;
let options = {
    PHP7compatible: false,
    DefaultDB: "UNDEFINED_DATABASE",
    generateFiles: {
        "Main.php": true,
        "Database.php": true,
    },
    indent: " ".repeat(4),
};
/** @param {OutputFile} file */
function addFileToList(file, color = null) {
    let i = document.createElement("i");
    i.classList.add("fas");
    i.classList.add("fa-file-alt");
    i.setAttribute("aria-hidden", "true");
    let span = document.createElement("span");
    span.classList.add("panel-icon");
    if (color !== null) span.style.color = color;
    span.appendChild(i);
    let a = document.createElement("a");
    a.classList.add("panel-block");
    a.classList.add("is-primary");
    a.appendChild(span);
    a.appendChild(document.createTextNode(file.name));
    a.onclick = () => showFile(file);
    el_files.appendChild(a);
}
/** @param {OutputFile} file */
function showFile(file) {
    if (!el_input.hasAttribute("readonly"))
        input = el_input.value;
    currentFile = file;
    el_input.value = file.content;
    el_input.setAttribute("readonly", "true");
}
function showInput() {
    if (!el_input.hasAttribute("readonly"))
        return;
    currentFile = null;
    el_input.removeAttribute("readonly");
    el_input.value = input;
}
function showError(e) {
    messageText.innerText = e.message;
    messageHolder.style.opacity = 1;
}
onload = () => {
    el_files = document.getElementById("files");
    el_generate = document.getElementById("generate");
    el_download = document.getElementById("download");
    el_downloadAll = document.getElementById("downloadAll");
    // el_copy = document.getElementById("copy");
    el_input = document.getElementById("input");
    el_messageHolder = document.getElementById("messageHolder");
    el_messageText = document.getElementById("messageText");

    el_generate.onclick = () => {
        let input = el_input.value;
        if (input == "")
            return;
        let files;
        try {
            files = SQL2PHP(input, options);
        } catch (e) {
            showError(e);
            return;
        }
        el_files.innerHTML = "";
        for (let file of Object.values(files))
            addFileToList(file);
        lastOutput = files;
    };

    
    // el_copy.onclick = () => {
    //     el_input.focus();
    //     el_input.select();
    //     document.execCommand('copy');
    // };

    el_download.onclick = () => {
        if (currentFile === null)
            return;
        saveAs(new Blob([currentFile.content], {type: "text/plain;charset=utf-8"}), currentFile.name);
    };

    el_downloadAll.onclick = () => {
        if (lastOutput === null)
            return;
        let zip = JSZip();
        for (let file of Object.values(lastOutput))
            zip.file(file.name, file.content);
        zip.generateAsync({type:"blob"}).then((blob) => {
            saveAs(blob, "SQL2PHP.zip");
        });
    };
};