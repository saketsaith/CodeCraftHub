const express = require("express");
const fs = require("fs/promises");
const path = require("path");

// Create the Express application
const app = express();

// The server will run on port 5050
const PORT = 5050;

// Store courses.json in the same directory as app.js
const DATA_FILE = path.join(__dirname, "courses.json");

// Allowed course status values
const VALID_STATUSES = [
  "Not Started",
  "In Progress",
  "Completed"
];

/*
  express.json() allows the API to read JSON request bodies.

  For example, it allows us to read data sent like this:

  {
    "name": "Node.js Basics",
    "description": "Learn the fundamentals of Node.js",
    "target_date": "2026-12-31",
    "status": "Not Started"
  }
*/
app.use(express.json());

/*
  Creates courses.json automatically if it does not already exist.

  The file starts with an empty array because courses will be
  stored as an array of objects.
*/
async function ensureDataFileExists() {
  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(DATA_FILE, "[]", "utf8");
    } else {
      throw error;
    }
  }
}

/*
  Reads all courses from courses.json.

  JSON.parse() converts the text in the file into a JavaScript array.
*/
async function readCourses() {
  await ensureDataFileExists();

  const fileContents = await fs.readFile(DATA_FILE, "utf8");

  try {
    const courses = JSON.parse(fileContents);

    // Make sure the JSON file contains an array
    if (!Array.isArray(courses)) {
      throw new Error("courses.json must contain an array");
    }

    return courses;
  } catch (error) {
    // This usually means the file contains invalid JSON
    const jsonError = new Error("courses.json contains invalid JSON");
    jsonError.code = "INVALID_JSON";
    throw jsonError;
  }
}

/*
  Writes the courses array back to courses.json.

  JSON.stringify() converts the JavaScript array into formatted JSON text.
*/
async function writeCourses(courses) {
  const jsonData = JSON.stringify(courses, null, 2);
  await fs.writeFile(DATA_FILE, jsonData, "utf8");
}

/*
  Checks whether a date uses the YYYY-MM-DD format and represents
  a real calendar date.

  For example:
  - 2026-12-31 is valid
  - 2026-02-30 is invalid
  - 31-12-2026 is invalid
*/
function isValidDateFormat(dateValue) {
  if (typeof dateValue !== "string") {
    return false;
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(dateValue)) {
    return false;
  }

  const [year, month, day] = dateValue.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/*
  Validates the required fields for a course.

  This function returns an error message if the data is invalid.
  It returns null when the data is valid.
*/
function validateCourseData(courseData) {
  const {
    name,
    description,
    target_date,
    status
  } = courseData;

  // Check for missing required fields
  if (
    name === undefined ||
    description === undefined ||
    target_date === undefined ||
    status === undefined
  ) {
    return "name, description, target_date, and status are required";
  }

  // Check that text fields are strings and not empty
  if (
    typeof name !== "string" ||
    name.trim().length === 0
  ) {
    return "name must be a non-empty string";
  }

  if (
    typeof description !== "string" ||
    description.trim().length === 0
  ) {
    return "description must be a non-empty string";
  }

  // Check the target date format
  if (!isValidDateFormat(target_date)) {
    return "target_date must be a valid date in YYYY-MM-DD format";
  }

  // Check the status value
  if (
    typeof status !== "string" ||
    !VALID_STATUSES.includes(status)
  ) {
    return `status must be one of: ${VALID_STATUSES.join(", ")}`;
  }

  return null;
}

/*
  Gets the next course ID.

  IDs start at 1. We find the highest existing ID and add 1.

  For example:
  - No courses exist: next ID is 1
  - Highest ID is 3: next ID is 4
*/
function getNextCourseId(courses) {
  if (courses.length === 0) {
    return 1;
  }

  const highestId = Math.max(
    ...courses.map(course => Number(course.id) || 0)
  );

  return highestId + 1;
}

/*
  GET /api/courses

  Returns all courses.
*/
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await readCourses();

    res.status(200).json(courses);
  } catch (error) {
    console.error("Error reading courses:", error);

    res.status(500).json({
      error: "Unable to read courses file"
    });
  }
});

/*
  GET /api/courses/:id

  Returns one course based on its ID.

  Example:
  GET /api/courses/1
*/
app.get("/api/courses/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    // IDs must be positive integers
    if (!Number.isInteger(courseId) || courseId < 1) {
      return res.status(400).json({
        error: "Course ID must be a positive integer"
      });
    }

    const courses = await readCourses();

    const course = courses.find(
      course => Number(course.id) === courseId
    );

    if (!course) {
      return res.status(404).json({
        error: "Course not found"
      });
    }

    res.status(200).json(course);
  } catch (error) {
    console.error("Error finding course:", error);

    res.status(500).json({
      error: "Unable to read course data"
    });
  }
});

/*
  POST /api/courses

  Adds a new course.

  Expected request body:

  {
    "name": "Express.js Basics",
    "description": "Learn Express.js",
    "target_date": "2026-12-31",
    "status": "Not Started"
  }
*/
app.post("/api/courses", async (req, res) => {
  try {
    const validationError = validateCourseData(req.body);

    if (validationError) {
      return res.status(400).json({
        error: validationError
      });
    }

    const courses = await readCourses();

    const newCourse = {
      id: getNextCourseId(courses),
      name: req.body.name.trim(),
      description: req.body.description.trim(),
      target_date: req.body.target_date,
      status: req.body.status,
      created_at: new Date().toISOString()
    };

    courses.push(newCourse);

    await writeCourses(courses);

    res.status(201).json({
      message: "Course created successfully",
      course: newCourse
    });
  } catch (error) {
    console.error("Error creating course:", error);

    res.status(500).json({
      error: "Unable to write course data"
    });
  }
});

/*
  PUT /api/courses/:id

  Updates an existing course.

  PUT replaces the editable course data, but the ID and created_at
  timestamp are preserved automatically.

  Example:
  PUT /api/courses/1
*/
app.put("/api/courses/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId < 1) {
      return res.status(400).json({
        error: "Course ID must be a positive integer"
      });
    }

    const validationError = validateCourseData(req.body);

    if (validationError) {
      return res.status(400).json({
        error: validationError
      });
    }

    const courses = await readCourses();

    const courseIndex = courses.findIndex(
      course => Number(course.id) === courseId
    );

    if (courseIndex === -1) {
      return res.status(404).json({
        error: "Course not found"
      });
    }

    const existingCourse = courses[courseIndex];

    const updatedCourse = {
      id: existingCourse.id,
      name: req.body.name.trim(),
      description: req.body.description.trim(),
      target_date: req.body.target_date,
      status: req.body.status,
      created_at: existingCourse.created_at
    };

    courses[courseIndex] = updatedCourse;

    await writeCourses(courses);

    res.status(200).json({
      message: "Course updated successfully",
      course: updatedCourse
    });
  } catch (error) {
    console.error("Error updating course:", error);

    res.status(500).json({
      error: "Unable to update course data"
    });
  }
});

/*
  DELETE /api/courses/:id

  Deletes a course based on its ID.

  Example:
  DELETE /api/courses/1
*/
app.delete("/api/courses/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId < 1) {
      return res.status(400).json({
        error: "Course ID must be a positive integer"
      });
    }

    const courses = await readCourses();

    const courseIndex = courses.findIndex(
      course => Number(course.id) === courseId
    );

    if (courseIndex === -1) {
      return res.status(404).json({
        error: "Course not found"
      });
    }

    const deletedCourse = courses.splice(courseIndex, 1)[0];

    await writeCourses(courses);

    res.status(200).json({
      message: "Course deleted successfully",
      course: deletedCourse
    });
  } catch (error) {
    console.error("Error deleting course:", error);

    res.status(500).json({
      error: "Unable to delete course data"
    });
  }
});

/*
    
    GET /api/courses/stats
    
    Returns statistics about the courses, including the total number of courses 
    and number of courses by status.

    Example invocation:
    GET /api/courses/stats
    Example response:
    {
      "total_courses": 10,
      "courses_by_status": {
        "Not Started": 4,
        "In Progress": 3,
        "Completed": 3
      }
    }
*/
app.get("/api/courses/stats", async (req, res) => {
  try {
    const courses = await readCourses();

    const totalCourses = courses.length;

    const statusCounts = VALID_STATUSES.reduce((acc, status) => {
      acc[status] = courses.filter(course => course.status === status).length;
      return acc;
    }, {});

    res.status(200).json({
      total_courses: totalCourses,
      courses_by_status: statusCounts
    });
  } catch (error) {
    console.error("Error retrieving course statistics:", error);

    res.status(500).json({
      error: "Unable to retrieve course statistics"
    });
  }
});

/*
  Handles invalid JSON sent in a request body.

  For example, this catches malformed JSON such as:

  {
    "name": "Course"
*/
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({
      error: "Request body contains invalid JSON"
    });
  }

  next(error);
});

/*
  Handles requests to endpoints that do not exist.
*/
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found"
  });
});

/*
  General error-handling middleware.

  This is a final safety net for unexpected errors.
*/
app.use((error, req, res, next) => {
  console.error("Unexpected server error:", error);

  res.status(500).json({
    error: "An unexpected server error occurred"
  });
});

/*
  Start the application.

  The data file is created before the server begins accepting requests.
*/
async function startServer() {
  try {
    await ensureDataFileExists();

    app.listen(PORT, () => {
      console.log(`CodeCraftHub API is running on port ${PORT}`);
      console.log(`Visit: http://localhost:${PORT}/api/courses`);
    });
  } catch (error) {
    console.error("Could not start the server:", error);
    process.exit(1);
  }
}
startServer();