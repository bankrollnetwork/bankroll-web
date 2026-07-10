var gulp = require("gulp");
// gulp-sass 5.x factory: pass dart-sass (pure JS) as the compiler. node-sass is EOL and has
// no build for Node 22 / Apple Silicon (arm64); dart-sass works on every platform/Node version.
var sass = require("gulp-sass")(require("sass"));
var browserSync = require("browser-sync").create();
var useref = require("gulp-useref");
var gulpIf = require('gulp-if');
//var uglify = require('gulp-uglify-es').default;
//var uglify = require('gulp-babel-minify')
var uglify = require('gulp-terser')
var cssnano = require('gulp-cssnano');
var htmlmin = require('gulp-htmlmin');
var rename = require('gulp-rename');
var imagemin = require('gulp-imagemin');
var del = require('del');
var runSequence = require('run-sequence');
var wait = require('gulp-wait');
var cachebust = require('gulp-cache-bust');
var htmlreplace = require('gulp-html-replace');


let userefConfig = {
    // each property corresponds to any blocks with the same name, e.g. "build:import"
    menu: function (content, target, options, alternateSearchPath) {

        let headerMenu = `
        
        
        `

        return headerMenu;
    }
}

gulp.task("sass", function () {
    return gulp
        .src("src/css/sass/themes/*.scss")
        .pipe(wait(700))
        .pipe(sass())
        .pipe(gulp.dest("src/css"))
        .pipe(cssnano({zindex: false}))
        .pipe(rename({suffix: '.min'}))
        .pipe(gulp.dest("src/css"))
        .pipe(gulp.dest("output.nosync/dist/css"));
});

gulp.task("browserSync", function () {
    return browserSync.init({
        server: ["src", "output.nosync/dist"],
        startPath: "index.html"
    });
});

gulp.task("browserlocal", function () {
    return browserSync.init({
        server: {
            baseDir: "output.nosync/dist"
        },
        startPath: "index.html"
    });
});

gulp.task("watchlocal", ["browserlocal"], function () {
    gulp.watch("output.nosync/dist/js/**/*.js", browserSync.reload);
    gulp.watch("output.nosync/dist/*.html", browserSync.reload);
});


gulp.task("watch", function () {
    //gulp.watch("src/css/sass/**/*.scss", ["sass", browserSync.reload]);
    gulp.watch("src/js/**/*.js", browserSync.reload);
    gulp.watch("src/*.html", browserSync.reload);
});

gulp.task("minifyjs", function () {
    return gulp.src('src/js/**/*')
      /*  .pipe(gulpIf('*.js', uglify({
            mangle:true})))*/
        .pipe(gulp.dest('output.nosync/dist/js'))
});

gulp.task("minifycss", function () {
    return gulp.src('src/css/**/*')
        .pipe(gulpIf('*.css', cssnano({zindex: false})))
        .pipe(gulp.dest('output.nosync/dist/css'))
});

/*
gulp.task("minifyhtml", function () {
    return gulp.src('src/*.html')
        .pipe(useref())
        .pipe(gulpIf('*.js', uglify({
            builtIns: false})))
        .pipe(gulpIf('*.css', cssnano({zindex: false})))
        .pipe(cachebust({
            type: 'timestamp'
        }))
        //.pipe(htmlmin())
        .pipe(gulp.dest('output.nosync/dist'))
});
*/

gulp.task("minifyhtml", function () {
    return gulp.src('src/*.html')
        .pipe(useref())
        .pipe(cachebust({
            type: 'timestamp'
        }))
        //.pipe(htmlmin())
        .pipe(gulp.dest('output.nosync/dist'))
});

gulp.task("minify:index", function (callback) {
    return gulp.src('src/index.compile.html')
        .pipe(useref())
        .pipe(gulpIf('*.css', cssnano({zindex: false})))
        .pipe(cachebust({
            type: 'timestamp'
        }))
        .pipe(gulp.dest('output.nosync/dist'))
});

gulp.task('images', function () {
    return gulp.src('src/img/**/*.+(png|jpg|gif|svg)')
    //.pipe(imagemin())
        .pipe(gulp.dest('output.nosync/dist/img'))
});

gulp.task('favicon', function () {
    return gulp.src('src/*.+(png|jpg|gif|svg|ico|xml|webmanifest|json)')
    //.pipe(imagemin())
        .pipe(gulp.dest('output.nosync/dist'))
});

gulp.task('font', function () {
    return gulp.src('src/font/**/*')
        .pipe(gulp.dest('output.nosync/dist/font'))
});

gulp.task('assets', function () {
    return gulp.src('src/assets/**/*')
        .pipe(gulp.dest('output.nosync/dist/assets'))
});

gulp.task('wellknown', function () {
    return gulp.src('src/.well-known/**/*')
        .pipe(gulp.dest('output.nosync/dist/.well-known'))
});

gulp.task('copy:bundle', async function () {
    await del(['src/css/index.css', 'src/js/index.js'])
    await gulp.src('output.nosync/dist/css/index.css')
        .pipe(gulp.dest('src/css'))
    return  gulp.src('output.nosync/dist/js/index.js')
        .pipe(gulp.dest('src/js'))

});

gulp.task('media', function () {
    return gulp.src('src/**/*.+(zip|pdf|mp3|xlsx)')
        .pipe(gulp.dest('output.nosync/dist'))
});

gulp.task('clean:dist', function () {
    return del.sync('output.nosync/dist');
})

gulp.task('default', function (callback) {
    runSequence(['sass','bootstrap', 'browserSync', 'watch'],
        callback
    )
})

gulp.task('local', function (callback) {
    runSequence(['browserlocal', 'watchlocal'],
        callback
    )
})

gulp.task('build', function (callback) {
    //runSequence('clean:dist','sass', "minifyhtml", "images",'favicon', 'font', 'media', 'assets', 'wellknown',
    runSequence('bootstrap','sass',"minifyjs", "minifycss", "minifyhtml", "images",'favicon', 'font', 'media', 'assets', 'wellknown',
        callback
    )
    
})

gulp.task('bootstrap', function (callback) {
    return runSequence("clean:dist","minify:index", callback)
})
