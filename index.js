const pluralize = require("pluralize");
const fs = require("fs");
const path = require("path");
const Validator = require('jsonschema').Validator;
const chalk = require('chalk');

const validator = new Validator({ options: { throwError: true } });
const BELONGS_TO = "belongsTo";
const HAS_MANY = "hasMany";

const loadSchema = () => {
  const path = `${__dirname}/schemas/Entity.json`;
  fs.readFileSync(path);

  try {
    return JSON.parse(fs.readFileSync(path));
  }
  catch (parseError) {
    throw Error(`${chalk.green(`${path}`)} is not a valid json file!`);

  }
}

const entityExists = (entity, names) => {
  entity.relations && entity.relations.forEach((relation) => {

    if (names.includes(relation.entity) === false) {
      throw Error(`${chalk.green(entity.name)} related to non existing entity ${chalk.red(relation.entity)}!`)
    }
  })

}

const fileNameEqualToEntity = (fileName, entity, path) => {
  if (fileName !== entity.name) {
    throw Error(`File name ${chalk.red(`"${fileName}"`)} is different than property "entity": ${chalk.red(`"${entity.name}"`)} in ${chalk.green(`"${path}"`)} file!`);
  }
}



const checkUniqueness = (array, fieldsNames, entityName) => {

  array.forEach(item => {

    if (fieldsNames.indexOf(item.name) !== -1) {
      throw Error(`Property ${chalk.red(`"${item.name}"`)}" in ${chalk.green(`"${entityName}"`)} definition is duplicated!`);
    }
    else {
      fieldsNames.push(item.name);
    }

  });
}


const checkFieldsUniqueness = (entity) => {

  const fieldsNames = [];
  checkUniqueness(entity.fields, fieldsNames, entity.name);
  checkUniqueness(entity.relations, fieldsNames, entity.name);
}

const validateEntitiesNames = (entities) => {
  var names = [];
  entities.forEach((entity) => {
    names.push(entity.name);
  })

  entities.forEach((entity) => {
    entityExists(entity, names);
  })

}

const validate = (entity, schema) => {
  validator.validate(entity, schema, { throwError: true })
}

const readEntities = (source) => {

  const schema = loadSchema();
  const files = fs.readdirSync(source);
  let entities = [];

  files.forEach((file) => {
    if (file.indexOf("json") > -1) {
      const path = source + "\\" + file;
      const fileName = file.split(".")[0];

      try {
        var entity = JSON.parse(fs.readFileSync(path));

      }
      catch (parseError) {
        throw Error(`${chalk.green(`${path}`)} is not a valid json file!`);

      }

      try {
        validate(entity, schema);
      }
      catch (error) {
        throw Error(`${error.toString().replace('instance', `${chalk.green(fileName)}`)}!`);

      }
      fileNameEqualToEntity(fileName, entity, path);
      checkFieldsUniqueness(entity);
      entities.push(entity);


    }


  });
  validateEntitiesNames(entities);
  return entities;
}



const convertArrayToObject = (array, key) => {

  var object = {};
  array.forEach((element) => {
    object[element[key]] = element;
  })
  return object;
};



const processEntities = (entities) => {

  const entitiesCollection = convertArrayToObject(entities, "name");
  entities.forEach((entity) => {

    entity.notations = getNotationVariants(entity.name);

    entity.hasName = hasName(entity.fields);
    entity.nameEquivalent = nameEquivalent(entity.fields);

    if (entity.relations) {
      processRelations(entity.relations, entitiesCollection);
      findName(entity.relations, entitiesCollection);
      setViews(entity.relations, entitiesCollection);
      countRelations(entity);
    }

  })
  return entities;
}


const getNotationVariants = (phrase) => {

  const camelCase = toCamelCase(phrase);
  const kebabCase = toKebabCase(phrase);
  const underscoreCase = toUnderscoreCase(phrase);
  const humanReadable = toHumanReadableName(phrase);

  return {
    camelCase: {
      singular: camelCase,
      plural: pluralize(camelCase)
    },
    kebabCase: {
      singular: kebabCase,
      plural: pluralize(kebabCase)
    },
    underscoreCase: {
      singular: underscoreCase,
      plural: pluralize(underscoreCase)
    },
    humanReadable: {
      singular: humanReadable,
      plural: pluralize(humanReadable)
    }
  }
}




const processRelations = (relations, entitiesCollection) => {
  relations.forEach((relation, index, relations) => {

    relation.notations = {};
    const notationVariantsForEntity = getNotationVariants(relation.entity);
    relation.notations.entity = notationVariantsForEntity;
    const notationVariantsForName = getNotationVariants(relation.name);
    relation.notations.name = notationVariantsForName;
    relation.targetRelations = readTargetRelations(relation, entitiesCollection);

  });
}


const readTargetRelations = (relation, entitiesCollection, preventRecursion) => {

  var targetResult = { belongsTo: [], hasMany: [] };
  var target = entitiesCollection[relation.entity];
  target.relations && target.relations.forEach((relation) => {

    var targetObject={ ...relation }
    if(!preventRecursion) {
      targetObject.targetRelations=readTargetRelations(relation,entitiesCollection,true)
    }

    if (relation.relation === BELONGS_TO) {
      targetResult.belongsTo.push(targetObject);
    } else if (relation.relation === HAS_MANY) {
      targetResult.hasMany.push(targetObject);
    }
  });
  return targetResult;
}




const countRelations = (entity) => {
  entity.hasManyRelationsCount = 0;
  entity.belongsToRelationsCount = 0;
  entity.relations.forEach((relation, index, relations) => {
    if (relation.relation === HAS_MANY) {
      entity.hasManyRelationsCount = ++entity.hasManyRelationsCount;
    }
    if (relation.relation === BELONGS_TO) {
      entity.belongsToRelationsCount = ++entity.belongsToRelationsCount;
    }
  });
}

const hasName = (fields) => {
  let hasName = false;
  fields.forEach((field) => {
    if (field.name == "name") {
      hasName = true;
    }
  });
  return hasName;
}

const nameEquivalent = (fields) => {
  if (!hasName(fields)) {

    for (let i in fields) {
      var field = fields[i];

      if (field.type == "string" && field.name !== "id") {
        return field.name;
      }
    }
    return "_id"
  } else {
    return "name";
  }
}

const findName = (relations, entitiesCollection) => {

  relations.forEach((relation, index, relations) => {

    relation.hasName = hasName(

      entitiesCollection[relation.entity].fields
    );
    relation.nameEquivalent = nameEquivalent(
      entitiesCollection[relation.entity].fields
    );

  });
}

const setViews = (relations, entitiesCollection) => {

  relations.forEach((relation, index, relations) => {
    relation.view = entitiesCollection[relation.entity].view;
  });
}


const toCamelCase = (text) => {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

const toKebabCase = (text) => {
  return text.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

const toUnderscoreCase = (text) => {
  return text.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

const toHumanReadableName = (text) => {
  return text.replace(/([a-z])([A-Z])/g, "$1 $2");
}


const checkFileExists = (entity, destination) => {
  return false;
}

const checkDirsExists = (fileName) => {
  const pathObject = path.parse(fileName);
  if (fs.existsSync(pathObject.dir)) {
    return true;
  }
}

const createDirs = (fileName) => {
  const pathObject = path.parse(fileName);
  fs.mkdirSync(pathObject.dir);
}


module.exports =
{
  readEntities: readEntities,
  processEntities: processEntities
}
