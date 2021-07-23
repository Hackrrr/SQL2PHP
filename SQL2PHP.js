/*
//TODO: Foreign key on composite primary key:
        FOREIGN KEY (xxx0, xxx1, xxx2)
            REFERENCES yyy (zzz0, zzz1, zzz2)
        (https://stackoverflow.com/questions/10565846/use-composite-primary-key-as-foreign-key)
//TODO: Emit warning on table name collision in different DBs (because of shared "Objects.php")
//TODO: GetByIndex (INDEX, UNIQUE, ...)
//TODO: Custom name patters
*/

/**
 * @enum {number}
 * @readonly
 */
const Type = Object.freeze({
    STRING: 0,
    NUMBER: 1,
    DATETIME: 2,
    ENUM: 3,
    BOOL: 4,
});
/**
 * @enum {Type}
 * @type {Object.<string, Type>}
 * @readonly
 */
const TypeMapping = Object.freeze({
    "VARCHAR": Type.STRING,
    "TEXT": Type.STRING,
    "INT": Type.NUMBER,
    "DATETIME": Type.DATETIME,
    "ENUM": Type.ENUM,
    "BIT": type_extra => type_extra == "1" ? Type.BOOL : Type.NUMBER,
});
/**
 * @enum {string}
 * @readonly
 */
const SQLType2PHPType = Object.freeze({
    [Type.STRING]: "string",
    [Type.NUMBER]: "int",
    [Type.DATETIME]: "int",
    [Type.ENUM]: "string",
    [Type.BOOL]: "bool",
});
/**
 * @enum {string}
 * @type {Object.<string, string>}
 * @readonly
 */
const PHPType2PreparedType = Object.freeze({
    "string": "s",
    "int": "i",
    "bool": "i",
});


class Column {
    /** @type {?Table} table */
    table = null;
    /** @type {ForeignKey[]} */
    remotelyReferencedBy = [];
    /**
     * @param {string} name 
     * @param {string} type 
     * @param {?string} type_extra
     * @param {boolean} nullable 
     * @param {boolean} autoIncrement 
     * @param {?PrimaryKey} primaryKey
     * @param {?ForeignKey} foreignKey
     */
    constructor(name, type, type_extra, nullable, autoIncrement, primaryKey = null, foreignKey = null) {
        this.name = name;
        this.type = TypeMapping[type.toUpperCase()];
        if (typeof this.type == "function")
            this.type = this.type(type_extra);
        this.type_extra = type_extra;
        this.nullable = nullable;
        this.autoIncrement = autoIncrement;
        this.primaryKey = primaryKey;
        this.foreignKey = foreignKey;
    }

    get PHPRawType() {
        return SQLType2PHPType[this.type];
    }
    get PHPType() {
        return `${this.nullable ? '?' : ''}${this.PHPRawType}`;
    }

    get PHPDef() {
        return `${this.PHPType} $${this.name}`;
    }

    get preparedType() {
        return PHPType2PreparedType[this.PHPRawType];
    }

    get nameForeignKeyAware() {
        return this.foreignKey == null ? this.name : (this.name + this.foreignKey.remoteColumn.name);
    }

    generateCtorDef(ignoreForeign = false) {
        return (ignoreForeign || this.foreignKey == null) ? `public ${this.PHPDef}` : `public ${this.PHPType} $${this.nameForeignKeyAware}`;
    }
    generateParserStatement() {
        switch (this.type) {
            case Type.STRING:
            case Type.NUMBER:
            case Type.ENUM:
                return `$assoc["${this.name}"]`;
            case Type.DATETIME:
                return `strtotime($assoc["${this.name}"])`;
            case Type.BOOL:
                return `$assoc["${this.name}"] === null ? null : (bool)$assoc["${this.name}"]`;
            default:
                throw new Error("Unknown type: " + this.type);
        }
    }
}

class Table {
    /** @type {Column[]} */
    columns = [];
    /** @type {?PrimaryKey} */
    primaryKey = null;
    /** @type {ForeignKey[]} */
    foreginKeys = [];
    /** @type {ForeignKey[]} */
    remotelyReferencedBy = [];

    /** @type {?Database} */
    db = null;
    /**
     * @param {string} name 
     * @param {Column[]} columns 
     * @param {?PrimaryKey} primaryKey
     */
    constructor(name, columns = [], primaryKey = null) {
        this.name = name;
        this.columns = columns;
        this.primaryKey = primaryKey;
    }

    /** @param {Column} column  */
    addColumn(column) {
        column.table = this;
        this.columns.push(column);
    }
    getColumn(name) {
        return this.columns.find(x=>x.name==name);
    }
    /** @param {ForeignKey} key  */
    addForeignKey(key) {
        if (this.columns.indexOf(key.localColumn) == -1)
            throw new Error("Foreign key doesn't have localColumn from this table");
        key.table = this;
        this.foreginKeys.push(key);
    }
    get isJoinTable() {
        return this.columns.length == 2 && this.foreginKeys.length == 2;
    }
    /** @param {PrimaryKey} key  */
    addPrimaryKey(key) {
        if (this.key != null)
            throw new Error("Tables cannot have more than one primary key");
        key.columns.forEach(x=>{
            if (x.primaryKey != null)
                throw new Error("Columns cannot have more than one primary key");
            x.primaryKey = key;
        });
        this.primaryKey = key;
    }
}
class ForeignKey {
    /**
     * @param {Column} localColumn
     * @param {Column} remoteColumn
     */
    constructor(localColumn, remoteColumn) {
        if (localColumn.type != remoteColumn.type)
            throw new Error("Type of columns must be same");
        if (localColumn.foreignKey != null)
            throw new Error("Column cannot have more than one foreign key");
        localColumn.foreignKey = this;
        this.localColumn = localColumn;
        this.remoteColumn = remoteColumn;
        remoteColumn.remotelyReferencedBy.push(this);
        remoteColumn.table.remotelyReferencedBy.push(this);
    }

    get Table() {
        return this.localColumn.table;
    }
}
class PrimaryKey {
    /** @param {Column[]} columns */
    constructor(columns) {
        this.table = columns[0].table;
        for (let column of columns) {
            if (this.table != column.table)
                throw new Error("All columns assigned as 'PRIMARY KEY' must be in same table");
            if (column.nullable)
                throw new Error("Column in 'PRIMARY KEY' must be 'NOT NULL'");
        }
        this.columns = columns;
        this.isSimple = columns.length == 1;
    }

    generateName() {
        return this.columns.map(x=>x.name).join("");
    }

    generatePHPDef(separator = ", ") {
        return this.columns.map(x=>x.PHPDef).join(separator);
    }
}

class Database {
    name;
    /** @type {Table[]} */
    tables = [];
    /**
     * @param {string} name 
     * @param {Table[]} tables 
     */
    constructor(name, tables = []) {
        this.name = name;
        this.tables = tables;
    }
    addTable(table) {
        table.db = this;
        this.tables.push(table);
    }
    getTable(name) {
        return this.tables.find(x=>x.name==name) ?? null;
    }
}
class OutputFile {
    name;
    content = "";
    indent = "";

    _indentLevel = 0;

    /**
     * @param {stirng} name 
     * @param {string} content 
     * @param {string} fileIndent
     */
    constructor(name, content = "", fileIndent = "    ") {
        this.name = name;
        this.content = content;
        this.indent = fileIndent;
    }
    write(text, indentDeltaBefore = 0, indentDeltaAfter = 0) {
        this._indentLevel += indentDeltaBefore;
        this.content += this.indent.repeat(this._indentLevel) + text;
        this._indentLevel += indentDeltaAfter;
    }
    writeLine(line, indentDeltaBefore = 0, indentDeltaAfter = 0) {
        this.write(line+"\n", indentDeltaBefore, indentDeltaAfter);
    }
    trimEnd() {
        this.content = this.content.trimEnd();
    }
    show() {
        console.log(this.content);
    }
}


function parseSQL(SQL, {
    delimiter = ";",
    trim = false,
    allowDelimiterChange = true,
    removeComments = true,
    ignoreDelimiterInBracket = false
} = {}) {
    let output = [];
    let current = "";

    const nestable = "\"'`";
    let nestedIn = "";
    let inMultilineComment = false;
    let inSimpleComment = false;
    let commnetLength = 0;
    let brackets = [];
    for (let x of SQL) {
        current += x;
        if (inMultilineComment || inSimpleComment)
            commnetLength++;

        if (inMultilineComment) {
            if (current.endsWith("*/")) {
                if (removeComments)
                    current = current.substring(0, current.length - commnetLength);
                commnetLength = 0;
                inMultilineComment = false;
            }
            continue;
        }
        if (inSimpleComment) {
            if (x == "\n" || x == "\r") {
                if (removeComments)
                    current = current.substring(0, current.length - commnetLength);
                commnetLength = 0;
                inSimpleComment = false;
            }
            continue
        }
        if (nestable.includes(x)) {
            nestedIn = nestedIn == x ? "" : x;
            continue;
        }
        if (nestedIn != "")
            continue;
        if (current.endsWith("/*")) {
            commnetLength = 2;
            inMultilineComment = true;
            continue;
        }
        if (current.endsWith("--")) {
            commnetLength = 2;
            inSimpleComment = true;
            continue;
        }
        if (x == "#") {
            commnetLength = 1;
            inSimpleComment = true;
            continue;
        }

        if (ignoreDelimiterInBracket) {
            if ("([{".includes(x)) {
                brackets.push(x);
                continue;
            } else if (")]}".includes(x)) {
                if (brackets.length == 0 || {
                    "(": ")",
                    "[": "]",
                    "{": "}"
                }[brackets[brackets.length-1]] != x)
                    throw new Error("Unmatched bracket");
                brackets.pop();
                continue;
            }
        }
        if (brackets.length != 0) continue;


        let match = allowDelimiterChange ? current.match(/^DELIMITER\s+(.+)$/i) : null;
        if (match !== null || current.endsWith(delimiter)) {
            if (match !== null)
                delimiter = match[1];
            else
                current = current.substring(0, current.length-delimiter.length);
            if (trim)
                current = current.trim();
            output.push(current);
            current = "";
            continue;
        }
    }
    if (current.trim() != "")
        output.push(trim ? current.trim() : current);
    return output;
}
/**
 * 
 * @param {string} input 
 * @returns {Object.<string, OutputFile>}
 */
function SQL2PHP(input, {
    PHP8syntax = true,
    defaultDB = "UNDEFINED_DATABASE",
    generateFiles = {
        "Main.php": true,
        "Database.php": true,
    },
    indent = " ".repeat(4),
} = {}) {
    if (input === null || input.trim() === "")
        throw new Error("No input");
    /**
     * @type {Object.<string, Database>}
     */
    let DBs = {};
    let currentDB = new Database(defaultDB);
    DBs[currentDB.name] = currentDB;
    /**
     * @param {string} name 
     * @param {Database} targetDB
     * @returns {Table}
     */
    function resolveTable(name, targetDB = currentDB) {
        if (name.includes(".")) {
            let splitted = name.split(".");
            if (!(splitted[0] in DBs))
                throw new Error(`DB "${splitted[0]}" not found when resolving table name "${name}"`)
            targetDB = DBs[splitted[0]];
            name = splitted[1];
        }
        return targetDB.getTable(name) ?? (function(){throw new Error(`Table "${name}" not found in DB "${targetDB.name}"`)}); // Něco proti? PepeLaugh TeaTime A pak že IIFE je k ničemu :)
    }

    let parsed = parseSQL(input, {
        trim: true,
    });
    let match;
    for (let statement of parsed) {
        if (statement == ""
            || statement.toUpperCase().startsWith("/*")
            || statement.toUpperCase().startsWith("#")
            || statement.toUpperCase().startsWith("FLUSH")
            || statement.toUpperCase().startsWith("GRANT")
            || statement.toUpperCase().startsWith("DROP")
            || statement.match(/^CREATE\s+USER/i)
            || statement.match(/^CREATE\s+DATABASE/i)
            ) continue;
        
        match = statement.match(/^CREATE\s+TABLE\s+(.+?)\s*\(((?:.|\s)*)\)(?:ENGINE\s*=.+)?$/i);
        if (match !== null) {
            let table = new Table(match[1]);
            currentDB.addTable(table);
            for (let definition of parseSQL(match[2], {
                delimiter: ",",
                trim: true,
                allowDelimiterChange: false,
                ignoreDelimiterInBracket: true
            })) {
                if (definition == "" || definition.toUpperCase().startsWith("INDEX")) continue;

                match = definition.match(/PRIMARY\s+KEY\s*\((.+)\)$/i);
                if (match !== null) {
                    let columns = match[1].split(/\s*,\s*/);
                    table.addPrimaryKey(new PrimaryKey(columns.map(x=>table.getColumn(x))));
                    continue;
                }

                match = definition.match(/^FOREIGN\s+KEY\s*\((.+)\)\s+REFERENCES\s+(.+)\((.+)\)(?:.|\s)*$/i);
                if (match !== null) {
                    let localColumn = match[1];
                    let remoteTable = match[2];
                    let remoteColumn = match[3];
                    table.addForeignKey(new ForeignKey(
                        table.getColumn(localColumn),
                        resolveTable(remoteTable).getColumn(remoteColumn),
                        table 
                    ));
                    continue;
                }

                match = definition.match(/^\s*(.+?)\s+(.+?)(?:\((.*?)\))?(?:(?!$)\s(.+?))?$/i);
                let name = match[1];
                let type = match[2];
                let type_extra = match[3];
                let extra = match[4];
                let nullable = !definition.toUpperCase().includes("NOT NULL");
                let autoIncrement = definition.toUpperCase().includes("AUTO_INCREMENT");
                let column = new Column(name, type, type_extra, nullable, autoIncrement);
                table.addColumn(column);
                if (definition.toUpperCase().includes("PRIMARY KEY"))
                    table.addPrimaryKey(new PrimaryKey([column]));
            }
            continue;
        }

        // match = statement.match(/CREATE\s+DATABASE\s+(.*?)(?:\s|$)/i);
        // if (match !== null) {
        //     DBs[match[1]] = new Database(match[1]);
        //     continue;
        // }
        match = statement.match(/USE\s+(.*)$/i);
        if (match !== null) {
            if (!(match[1] in DBs))
                DBs[match[1]] = new Database(match[1]);
            currentDB = DBs[match[1]];
            continue;
        }
        throw new Error(`Unknown statement '${statement}'`);
    }

    // SQL PARSED, NOW TO CODE GEN!
    let objFile = new OutputFile("Objects.php", "", indent);
    objFile.writeLine("<?php");
    let output = {"Objects.php": objFile};
    for (let DB of Object.values(DBs)) {
        if (DB.tables == 0)
            continue;
        let f = new OutputFile(`${DB.name}.php`, "", indent);
        output[f.name] = f;

        f.writeLine("<?php");
        // DB CLASS
        f.writeLine(`class ${DB.name} {`, 0, 1);
        for (let t of DB.tables) {
            if (t.primaryKey == null) // As whole codegen relies on primary key(s), there is nothing we can do here
                continue;
            f.writeLine(`/** @return ${t.name}[] */`);
            f.writeLine(`public static function GetAll${t.name}(${t.foreginKeys.length == 0 ? "" : "bool $resolve = false"}) : array {`, 0, 1);
                f.writeLine(`$output = [];`);
                f.writeLine(`$result = Database::Execute("SELECT * FROM ${t.name}");`);
                f.writeLine(`while ($row = $result->fetch_assoc())`);
                    f.writeLine(`$output[] = ${t.name}::ParseAssoc($row${t.foreginKeys.length == 0 ? "" : ", $resolve"});`, 1, -1);
                f.writeLine(`$result->free();`);
                f.writeLine(`return $output;`);
            f.writeLine(`}`, -1);

            f.writeLine(`public static function Get${t.name}(${t.primaryKey.generatePHPDef()}${t.foreginKeys.length == 0 ? "" : ", bool $resolve = true"}) : ?${t.name} {`, 0, 1);
                f.writeLine(`$result = Database::ExecuteAsPrepared("SELECT * FROM ${t.name} WHERE ${t.primaryKey.columns.map(x=>`${x.name} = ?`).join(" AND ")} LIMIT 1", "${t.primaryKey.columns.map(x=>x.preparedType).join("")}", [${t.primaryKey.columns.map(x=>`$${x.name}`).join(", ")}]);`);
                f.writeLine(`$row = $result->fetch_assoc();`);
                f.writeLine(`if ($row == null) return null;`);
                f.writeLine(`$output = ${t.name}::ParseAssoc($row${t.foreginKeys.length == 0 ? "" : ", $resolve"});`);
                f.writeLine(`$result->free();`);
                f.writeLine(`return $output;`);
            f.writeLine(`}`, -1);

            f.writeLine(`/**`);
            f.writeLine(` * @param (${t.primaryKey.columns.map(x=>x.PHPType).filter((x,y,z)=>z.indexOf(x)===y).join("|")})${t.primaryKey.isSimple ? '' : '[]'}[] $identifiers${t.primaryKey.isSimple ? "" : ` [ ..., [${t.primaryKey.columns.map(x=>`$${x.name}`).join(", ")}], ...]`}`);
            f.writeLine(` * @return ${t.name}[]`);
            f.writeLine(` */`);
            f.writeLine(`public static function Get${t.name}Pack(array $identifiers${t.foreginKeys.length == 0 ? "" : ", bool $resolve = true"}) : array {`, 0, 1);
                f.writeLine(`$count = count($identifiers);`);
                f.writeLine(`if ($count == 0) return [];`);
                f.writeLine(`$output = [];`);
                if (t.primaryKey.isSimple)
                    f.writeLine(`$result = Database::ExecuteAsPrepared("SELECT * FROM ${t.name} WHERE ${t.primaryKey.columns[0].name} IN (".implode(",",array_fill(0, $count, "?")).")", str_repeat("${t.primaryKey.columns[0].preparedType}", $count), $identifiers);`);
                else
                    f.writeLine(`$result = Database::ExecuteAsPrepared("SELECT * FROM ${t.name} WHERE ".implode(" OR ", array_fill(0, $count, "(${t.primaryKey.columns.map(x=>`${x.name} = ?`).join(" AND ")})")), str_repeat("${t.primaryKey.columns.map(x=>x.preparedType).join("")}", $count), array_merge(...$identifiers));`);
                f.writeLine(`while ($row = $result->fetch_assoc())`);
                    f.writeLine(`$output[] = ${t.name}::ParseAssoc($row${t.foreginKeys.length == 0 ? "" : ", $resolve"});`, 1, -1);
                f.writeLine(`$result->free();`);
                f.writeLine(`return $output;`);
            f.writeLine(`}`, -1);
            if (!t.primaryKey.isSimple) {
                for (let primary of t.primaryKey.columns) {
                    f.writeLine(`/** @return ${t.name}[] */`);
                    f.writeLine(`public static function Get${t.name}PackBy${primary.name}(${primary.PHPDef}${t.foreginKeys.length == 0 ? "" : ", bool $resolve = true"}) : array {`, 0, 1);
                        f.writeLine(`$output = [];`);
                        f.writeLine(`$result = Database::ExecuteAsPrepared("SELECT * FROM ${t.name} WHERE ${primary.name} = ?", "${primary.preparedType}", [$${primary.name}]);`);
                        f.writeLine(`while ($row = $result->fetch_assoc())`);
                            f.writeLine(`$output[] = ${t.name}::ParseAssoc($row${t.foreginKeys.length == 0 ? "" : ", $resolve"});`, 1, -1);
                        f.writeLine(`$result->free();`);
                        f.writeLine(`return $output;`);
                    f.writeLine(`}`, -1);
                }
            }
            f.writeLine("");
        }
        f.trimEnd();
        f.writeLine("");
        f.writeLine("");
        // INSERT/MODIFY METHODS
        f.writeLine("/* DB MANAGEMENT METHODS */");
        for (let t of DB.tables) {
            let names = [];
            for (let c of t.columns) {
                names.push(c.name);
            }
            f.writeLine(`/** @return int|string ID of new entry in DB (if the number is greater than maximal int value, it is returned as a string) */`);
            f.writeLine(`public static function Create${t.name}(${t.columns.filter(x=>!x.autoIncrement).map(x=>x.PHPDef).join(", ")}) : int|string {`, 0, 1);
                f.writeLine(`Database::ExecuteAsPrepared("INSERT INTO ${t.name} (${t.columns.filter(x=>!x.autoIncrement).map(x=>x.name).join(", ")}) VALUES(${Array(t.columns.filter(x=>!x.autoIncrement).length).fill("?").join(",")})", "${t.columns.filter(x=>!x.autoIncrement).map(x=>x.preparedType).join("")}", [${t.columns.filter(x=>!x.autoIncrement).map(x=>"$"+x.name).join(", ")}]);`);
                f.writeLine(`return Database::$Connection->insert_id;`);
            f.writeLine("}", -1);
            if (t.primaryKey == null)
                continue;
            f.writeLine(`public static function Delete${t.name}(${t.primaryKey.columns.map(x=>x.PHPDef).join(", ")}) {`, 0, 1);
                f.writeLine(`Database::ExecuteAsPrepared("DELETE FROM Foto WHERE ${t.primaryKey.columns.map(x=>`${x.name} = ?`).join(" AND ")}", "${t.primaryKey.columns.map(x=>x.preparedType).join("")}", [${t.primaryKey.columns.map(x=>`$${x.name}`).join(", ")}]);`);
            f.writeLine("}", -1);
            if (!t.isJoinTable) {
                f.writeLine(`public static function Modify${t.name}(${t.columns.map(x=>x.PHPDef).join(", ")}) {`, 0, 1);
                    f.writeLine(`Database::ExecuteAsPrepared("UPDATE ${t.name} SET ${names.map(x=>`${x} = ?`).join(", ")} WHERE ${t.primaryKey.columns.map(x=>`${x.name} = ?`).join(" AND ")}", "${t.columns.map(x=>x.preparedType).join("")}${t.primaryKey.columns.map(x=>x.preparedType).join("")}", [${names.map(x=>"$"+x).join(", ")}, ${t.primaryKey.columns.map(x=>`$${x.name}`).join(", ")}]);`);
                    f.writeLine(`return Database::$Connection->insert_id;`);
                f.writeLine("}", -1);
            }
            f.writeLine("");
        }
        f.writeLine("}", -1);
        f.writeLine("?>");

        // OBJECTS
        for (let t of DB.tables) {
            objFile.writeLine(`class ${t.name} {`, 0, 1);
                if (!PHP8syntax)
                    for (let c of t.columns)
                        objFile.writeLine(`${c.generateCtorDef()};`);
                for (let k of t.foreginKeys)
                    objFile.writeLine(`public ?${k.remoteColumn.table.name} $${k.localColumn.name} = null;`); //TODO: Emit warning on name collision
                objFile.writeLine(`public function __construct(`, 0, 1);
                    for (let c of t.columns)
                        objFile.writeLine(PHP8syntax ? `${c.generateCtorDef()},` : `${c.PHPType} $${c.nameForeignKeyAware},` );
                    if (t.foreginKeys.length != 0)
                        objFile.writeLine("bool $resolve = true,"); //TODO: Emit warning on name collision
                if (!PHP8syntax) {
                    objFile.writeLine(") {", -1, 1);
                    for (let c of t.columns)
                        objFile.writeLine(`$this->${c.nameForeignKeyAware} = $${c.nameForeignKeyAware};`);
                    if (t.foreginKeys.length != 0)
                        objFile.writeLine("$resolve ? $this->Resolve() : null;");
                    objFile.writeLine("}", -1);
                } else {
                    objFile.writeLine(`) { ${t.foreginKeys.length == 0 ? "" : "$resolve ? $this->Resolve() : null; "}}`, -1);
                }
                objFile.writeLine("");

                objFile.writeLine(`public static function ParseAssoc(array $assoc${t.foreginKeys.length == 0 ? "" : ", bool $resolve = true"}) {`, 0, 1);
                    objFile.writeLine(`return new ${t.name}(`, 0, 1);
                    for (let c of t.columns)
                        objFile.writeLine(`${c.generateParserStatement()},`);
                    if (t.foreginKeys.length != 0)
                        objFile.writeLine("$resolve,")
                    objFile.writeLine(");", -1);
                objFile.writeLine("}", -1);

                if (t.foreginKeys.length != 0) {
                    objFile.writeLine("public function Resolve() {", 0, 1);
                        for (let k of t.foreginKeys)
                            objFile.writeLine(`if ($this->${k.localColumn.nameForeignKeyAware} != null) $this->${k.localColumn.name} = ${DB.name}::Get${k.remoteColumn.table.name}($this->${k.localColumn.nameForeignKeyAware});`);
                    objFile.writeLine("}", -1);
                    objFile.writeLine("");
                }

                for (let referencedBy of t.remotelyReferencedBy) {
                    objFile.writeLine(`/** @return ${referencedBy.Table.name}[] */`);
                    objFile.writeLine(`public function GetReferencesFrom${referencedBy.Table.name}By${referencedBy.localColumn.nameForeignKeyAware}(${referencedBy.Table.foreginKeys.length == 0 ? "" : "bool $resolve"}) {`, 0, 1);
                        objFile.writeLine("$output = [];");
                        objFile.writeLine(`$result= Database::ExecuteAsPrepared("SELECT * FROM ${referencedBy.Table.name} WHERE ${referencedBy.localColumn.name} = ?", "${referencedBy.localColumn.preparedType}", [$this->${referencedBy.remoteColumn.nameForeignKeyAware}]);`);
                        objFile.writeLine(`while ($row = $result->fetch_assoc())`);
                            objFile.writeLine(`$output[] = ${referencedBy.Table.name}::ParseAssoc($row${referencedBy.Table.foreginKeys.length == 0 ? "" : ", $resolve"});`, 1, -1);
                        objFile.writeLine(`return $output;`);
                    objFile.writeLine("}", -1);

                    if (!referencedBy.Table.isJoinTable)
                        continue;
                    let firstSideForeignKey = referencedBy.Table.foreginKeys[0];
                    let secondSideForeignKey = referencedBy.Table.foreginKeys[1];
                    if (secondSideForeignKey.remoteColumn.table == t) {
                        firstSideForeignKey = referencedBy.Table.foreginKeys[1];
                        secondSideForeignKey = referencedBy.Table.foreginKeys[0];
                    }

                    objFile.writeLine(`public function Resolve${secondSideForeignKey.remoteColumn.table.name}s() {`, 0, 1);
                        objFile.writeLine(`$this->${secondSideForeignKey.remoteColumn.table.name}s = ${DB.name}::Get${secondSideForeignKey.remoteColumn.table.name}Pack(array_map(function($x){return $x->${secondSideForeignKey.localColumn.nameForeignKeyAware};}, ${DB.name}::Get${referencedBy.Table.name}PackBy${t.name}($this->${firstSideForeignKey.remoteColumn.name})));`);
                    objFile.writeLine("}", -1);
                }
            objFile.writeLine("}", -1);
        }
    }
    objFile.writeLine("?>");
    return output;
}