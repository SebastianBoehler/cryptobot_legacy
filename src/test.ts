import * as tf from '@tensorflow/tfjs-node'

async function trainAndSaveModel() {
  // 1. Create a simple linear regression model
  const model = tf.sequential()
  model.add(tf.layers.dense({ units: 1, inputShape: [1] }))

  // 2. Compile the model
  model.compile({ loss: 'meanSquaredError', optimizer: 'sgd' })

  // 3. Generate some sample data
  const xs = tf.tensor2d([1, 2, 3, 4], [4, 1])
  const ys = tf.tensor2d([2, 4, 6, 8], [4, 1])

  // 4. Train the model
  await model.fit(xs, ys, { epochs: 100 })

  // 5. Save the model to a file
  await model.save('file://./src/model')
}

trainAndSaveModel()
