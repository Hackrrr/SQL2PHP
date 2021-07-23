# SQL2PHP
Simple script/application for generating PHP code based on SQL. Can be used as application (Github pages) or can be used as script and integrated into something else.

# Output
Code will generate these files:
- `Objects.php` - File with all PHP class definitions
- `Database.php` - Static file with `Database` class that is used in generated files
- Multiple `MyDatabase.php` - Each of these files is named by one DB in SQL input and this one file contains class definition for this on DB.

# What it uses?
- [Bulma (CSS framework)](https://bulma.io/)
- [Font Awesome (icons)](https://fontawesome.com/)
- [FileSaver (JS file downloader)](https://github.com/eligrey/FileSaver.js/)
- [JS Zip (JS zip creator)](https://stuk.github.io/jszip/)