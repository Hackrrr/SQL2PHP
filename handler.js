let el_files, el_generate, el_copy, el_download, el_downloadAll, el_input, el_messageHolder, el_messageText,
    el_modalButton, el_modalHolder, el_modalClose, el_modalCloseButton,
    el_modal_PHP8, el_modal_defaultDB, el_modal_indent, el_modal_generate_database;
let lastInput = "";
/** @type {?OutputFile} */
let currentFile = null;
/** @type {OutputFile[]|null} */
let lastOutput = null;
let options = {
    PHP8syntax: true,
    defaultDB: "UNDEFINED_DATABASE",
    generateFiles: {
        // "Main.php": true,
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
        lastInput = el_input.value;
    currentFile = file;
    el_input.value = file.content;
    el_input.setAttribute("readonly", "true");
}
function showInput() {
    if (!el_input.hasAttribute("readonly"))
        return;
    currentFile = null;
    el_input.removeAttribute("readonly");
    el_input.value = lastInput;
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

    el_modalButton = document.getElementById("options");
    el_modalHolder = document.getElementById("modal");
    el_modalClose = document.getElementById("modalClose");
    el_modalCloseButton = document.getElementById("modalCloseButton");

    el_modal_PHP8 = document.getElementById("modal_PHP8");
    el_modal_defaultDB = document.getElementById("modal_defaultDB");
    el_modal_indent = document.getElementById("modal_indent");
    el_modal_generate_database = document.getElementById("modal_generate_database");

    el_generate.onclick = () => {
        generate();
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

    el_modalButton.onclick = () => {
        el_modalHolder.classList.toggle("is-active");
        getSettings(); // Called even on open but who cares LULW
    };
    el_modalClose.onclick = el_modalButton.onclick;
    el_modalCloseButton.onclick = el_modalButton.onclick;
};

function generate() {
    let input = el_input.hasAttribute("readonly") ? lastInput : el_input.value;
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

    if (currentFile !== null && currentFile.name in files)
        showFile(files[currentFile.name]);
}

function getSettings() {
    options.PHP8syntax = el_modal_PHP8.checked;
    options.generateFiles["Database.php"] = el_modal_generate_database.checked;
    options.defaultDB = el_modal_defaultDB.value;
    if (options.defaultDB == "")
        options.defaultDB = "UNDEFINED_DATABASE";
    options.indent = el_modal_indent.value;
    if (options.indent == "")
        options.indent = " ".repeat(4);
}




function drop(e) {
    e.preventDefault();
    let file = e.dataTransfer.files[0];
    if (!file || !("text" in file)) return;
    file.text().then((x) => {
        el_input.value = x;
        generate();
    });
}