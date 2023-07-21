const express = require("express");
const app = express();
const exphbs = require("express-handlebars");
const path = require("path");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const stripJs = require("strip-js");
const blogService = require("./blog-service.js");
const HTTP_PORT = process.env.PORT || 8080;

// middleware
app.use(express.urlencoded({ extended: true }));

app.use(function (req, res, next) {
  let route = req.path.substring(1);

  app.locals.activeRoute =
    "/" +
    (isNaN(route.split("/")[1])
      ? route.replace(/\/(?!.*)/, "")
      : route.replace(/\/(.*)/, ""));

  app.locals.viewingCategory = req.query.category;

  next();
});

app.use(express.static(path.join(__dirname, "public")));

// Handlebars configuration
app.engine(
  ".hbs",
  exphbs.engine({
    extname: ".hbs",
    helpers: {
      navLink: function (url, options) {
        return (
          "<li" +
          (url == app.locals.activeRoute ? ' class="active" ' : "") +
          '><a href="' +
          url +
          '">' +
          options.fn(this) +
          "</a></li>"
        );
      },

      equal: function (lvalue, rvalue, options) {
        if (arguments.length < 3)
          throw new Error("Handlebars Helper equal needs 2 parameters");
        if (lvalue != rvalue) {
          return options.inverse(this);
        } else {
          return options.fn(this);
        }
      },

      safeHTML: function (context) {
        return stripJs(context);
      },

      // formatDate to keep dates formatting consistent in views.
      // {{#formatDate postDate}}{{/formatDate}}
      formatDate: function (dateObj) {
        let year = dateObj.getFullYear();
        let month = (dateObj.getMonth() + 1).toString();
        let day = dateObj.getDate().toString();
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      },
    },
  })
);
app.set("view engine", ".hbs");

// cloudinary configuration
cloudinary.config({
  cloud_name: "dujgmgpvq",
  api_key: "494927485573586",
  api_secret: "oldXgv5-41RCrw7sYig-OG75qSo",
  secure: true,
});

// multer setup
const upload = multer(); // no { storage: storage } since we are not using disk storage

// handle HTTP server start
function onHttpStart() {
  console.log("Express http server listening on " + HTTP_PORT);
}

// routes
// home route
app.get("/", (req, res) => res.redirect("/about"));

// route about
app.get("/about", (req, res) => res.render("about"));

// route blog
app.get("/blog", async (req, res) => {
  // Declare an object to store properties for the view
  let viewData = {};

  try {
    // declare empty array to hold "post" objects
    let posts = [];

    // if there's a "category" query, filter the returned posts by category
    if (req.query.category) {
      // Obtain the published "posts" by category
      posts = await blogService.getPublishedPostsByCategory(req.query.category);
    } else {
      // Obtain the published "posts"
      posts = await blogService.getPublishedPosts();
    }

    // sort the published posts by postDate
    posts.sort((a, b) => new Date(b.postDate) - new Date(a.postDate));

    // get the latest post from the front of the list (element 0)
    let post = posts[0];

    // store the "posts" and "post" data in the viewData object (to be passed to the view)
    viewData.posts = posts;
    viewData.post = post;
  } catch (err) {
    viewData.message = "no results";
  }

  try {
    // Obtain the full list of "categories"
    let categories = await blogService.getCategories();

    // store the "categories" data in the viewData object (to be passed to the view)
    viewData.categories = categories;
  } catch (err) {
    viewData.categoriesMessage = "no results";
  }

  // render the "blog" view with all of the data (viewData)
  res.render("blog", { data: viewData });
});

// route posts / post
app.get("/posts", (req, res) => {
  const category = req.query.category;
  const minDateStr = req.query.minDate;
  blogService
    .getAllPosts()
    .then((data) => {
      if (category) {
        return blogService.getPostsByCategory(category);
      } else if (minDateStr) {
        return blogService.getPostsByMinDate(minDateStr);
      } else {
        return Promise.resolve(data);
      }
    })
    .then((result) => {
      if (!result.length) {
        return Promise.reject("no results");
      }
      res.render("posts", { posts: result });
    })
    .catch((err) => res.render("posts", { message: err }));
});

app.get("/post/:id", (req, res) => {
  blogService
    .getPostById(req.params.id)
    .then((result) => res.json(result))
    .catch((err) => res.json({ message: err }));
});

app.get("/posts/add", (req, res) => {
  blogService
    .getCategories()
    .then((data) => res.render("addPost", { categories: data }))
    .catch((err) => res.render("addPost", { categories: [] }));
});

app.post("/posts/add", upload.single("featureImage"), (req, res) => {
  if (req.file) {
    let streamUpload = (req) => {
      return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream((error, result) => {
          if (result) {
            resolve(result);
          } else {
            reject(error);
          }
        });

        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
    };

    async function upload(req) {
      let result = await streamUpload(req);
      return result;
    }

    upload(req).then((uploaded) => {
      req.body.featureImage = uploaded.url;
      blogService
        .addPost(req.body)
        .then(() => res.redirect("/posts"))
        .catch((err) => res.json({ message: err }));
    });
  } else {
    // Handle the case when no image is uploaded
    req.body.featureImage = null;
    blogService
      .addPost(req.body)
      .then(() => res.redirect("/posts"))
      .catch((err) => res.json({ message: err }));
  }
});

app.get("/posts/delete/:id", (req, res) => {
  blogService
    .deletePostById(req.params.id)
    .then(() => res.redirect("/posts"))
    .catch((err) => res.status(500).send(err));
});

// route blog
app.get("/blog/:id", async (req, res) => {
  // Declare an object to store properties for the view
  let viewData = {};

  try {
    // declare empty array to hold "post" objects
    let posts = [];
    // if there's a "category" query, filter the returned posts by category
    if (req.query.category) {
      // Obtain the published "posts" by category
      posts = await blogService.getPublishedPostsByCategory(req.query.category);
    } else {
      // Obtain the published "posts"
      posts = await blogService.getPublishedPosts();
    }

    // sort the published posts by postDate
    posts.sort((a, b) => new Date(b.postDate) - new Date(a.postDate));
    // store the "posts" and "post" data in the viewData object (to be passed to the view)
    viewData.posts = posts;
  } catch (err) {
    viewData.message = "no results";
  }

  try {
    // Obtain the post by "id"
    viewData.post = await blogService.getPostById(req.params.id);
  } catch (err) {
    viewData.message = "no results";
  }

  try {
    // Obtain the full list of "categories"
    let categories = await blogService.getCategories();
    // store the "categories" data in the viewData object (to be passed to the view)
    viewData.categories = categories;
  } catch (err) {
    viewData.categoriesMessage = "no results";
  }

  // render the "blog" view with all of the data (viewData)
  res.render("blog", { data: viewData });
});

// route categories
app.get("/categories", (req, res) => {
  blogService
    .getCategories()
    .then((data) => {
      if (!data.length) {
        return Promise.reject("no results");
      }
      res.render("categories", { categories: data });
    })
    .catch((err) => res.render("categories", { message: err }));
});

app.get("/categories/add", (req, res) => res.render("addCategory"));

app.post("/categories/add", (req, res) => {
  blogService
    .addCategory(req.body)
    .then(() => res.redirect("/categories"))
    .catch((err) => res.json({ message: err }));
});

app.get("/categories/delete/:id", (req, res) => {
  blogService
    .deleteCategoryById(req.params.id)
    .then(() => res.redirect("/categories"))
    .catch((err) => res.status(500).send(err));
});

// handle unknown routes
app.use((req, res) => res.status(404).render("404"));

// server start
blogService
  .initialize()
  .then((result) => app.listen(HTTP_PORT, onHttpStart))
  .catch((error) => console.log(error));
