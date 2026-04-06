import React from 'react';
import {
  Box,
  Text,
  useColorModeValue,
  Flex,
  Heading,
  Icon,
  Divider,
  IconProps,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { 
  FiDatabase, 
  FiCpu, 
  FiUsers, 
  FiServer,
  FiArrowRight,
  FiRefreshCw,
} from 'react-icons/fi';
import { IconType } from 'react-icons';

// Create a custom icon component that accepts IconType
const CustomIcon = ({ icon, ...props }: { icon: IconType } & Omit<IconProps, 'as'>) => {
  // Use type assertion to bypass TypeScript's strict checking for react-icons v5+
  return <Icon as={icon as any} {...props} />;
};

const MotionBox = motion(Box);
const MotionFlex = motion(Flex);

interface FederationSchemaProps {
  aggregator: 'fedavg' | 'fedprox' | 'scaffold';
  privacy?: 'differential_privacy' | 'secure_aggregation' | null;
  isActive?: boolean;
}

export const FederationSchema: React.FC<FederationSchemaProps> = ({
  aggregator,
  privacy = null,
  isActive = false,
}) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const subTextColor = useColorModeValue('gray.600', 'gray.400');
  
  // Colors for different components
  const serverColor = useColorModeValue('blue.500', 'blue.300');
  const clientColor = useColorModeValue('green.500', 'green.300');
  const dataColor = useColorModeValue('purple.500', 'purple.300');
  const modelColor = useColorModeValue('orange.500', 'orange.300');
  const arrowColor = useColorModeValue('gray.400', 'gray.500');
  
  // Constants for animation
  const animationDuration = 0.5;
  const staggerDelay = 0.15;
  
  // Helper texts for different aggregators
  const aggregatorDescription = {
    'fedavg': 'Federated Averaging (FedAvg) combines client models by averaging their parameters.',
    'fedprox': 'FedProx adds a proximal term to the loss function to limit client model drift.',
    'scaffold': 'SCAFFOLD uses control variates to correct for client drift during training.'
  };
  
  // Helper texts for privacy mechanisms
  const privacyDescription = {
    'differential_privacy': 'Differential Privacy adds calibrated noise to client updates.',
    'secure_aggregation': 'Secure Aggregation uses cryptography to sum encrypted client updates.',
    'null': 'No privacy mechanism is being used in this configuration.'
  };
  
  return (
    <Box
      p={4}
      borderRadius="lg"
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
    >
      <Heading size="sm" mb={4} color={textColor}>
        Federated Learning Schema
      </Heading>
      
      <Flex direction="column" align="center" mb={4}>
        {/* Server Node */}
        <MotionBox
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: animationDuration }}
        >
          <Flex
            direction="column"
            align="center"
            mb={6}
          >
            <Box
              w="60px"
              h="60px"
              borderRadius="md"
              bg={serverColor}
              display="flex"
              alignItems="center"
              justifyContent="center"
              mb={2}
              boxShadow="md"
            >
              <CustomIcon icon={FiServer} color="white" boxSize={6} />
            </Box>
            <Text fontSize="sm" fontWeight="medium" color={textColor}>
              Central Server
            </Text>
            <Text fontSize="xs" color={subTextColor} textAlign="center" maxW="150px">
              Coordinates training and aggregates models
            </Text>
          </Flex>
        </MotionBox>
        
        {/* Aggregation Arrow */}
        <MotionFlex
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: animationDuration, delay: staggerDelay }}
          align="center"
          mb={4}
        >
          <CustomIcon 
            icon={FiRefreshCw} 
            color={arrowColor} 
            boxSize={5} 
            mr={2}
            className={isActive ? "rotating-icon" : ""}
            sx={{
              "@keyframes rotate": {
                "0%": { transform: "rotate(0deg)" },
                "100%": { transform: "rotate(360deg)" }
              },
              ".rotating-icon": {
                animation: isActive ? "rotate 2s linear infinite" : "none"
              }
            }}
          />
          <Text fontSize="xs" fontWeight="medium" color={modelColor}>
            {aggregator.toUpperCase()}
            {privacy && privacy === 'differential_privacy' && ' + DP'}
            {privacy && privacy === 'secure_aggregation' && ' + SecAgg'}
          </Text>
        </MotionFlex>
        
        {/* Client Nodes */}
        <MotionFlex
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: animationDuration, delay: staggerDelay * 2 }}
          justify="space-around"
          w="100%"
          mb={4}
        >
          {[1, 2, 3].map((i) => (
            <Flex key={i} direction="column" align="center">
              <Box
                w="50px"
                h="50px"
                borderRadius="md"
                bg={clientColor}
                display="flex"
                alignItems="center"
                justifyContent="center"
                mb={2}
                boxShadow="md"
                className={isActive ? "pulse-animation" : ""}
                sx={{
                  "@keyframes pulse": {
                    "0%": { boxShadow: "0 0 0 0 rgba(72, 187, 120, 0.4)" },
                    "70%": { boxShadow: "0 0 0 10px rgba(72, 187, 120, 0)" },
                    "100%": { boxShadow: "0 0 0 0 rgba(72, 187, 120, 0)" }
                  },
                  ".pulse-animation": {
                    animation: isActive ? "pulse 2s infinite" : "none"
                  }
                }}
              >
                <CustomIcon icon={FiUsers} color="white" boxSize={5} />
              </Box>
              <Text fontSize="sm" fontWeight="medium" color={textColor}>
                Client {i}
              </Text>
            </Flex>
          ))}
        </MotionFlex>
        
        {/* Data Icon */}
        <MotionFlex
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: animationDuration, delay: staggerDelay * 3 }}
          justify="space-around"
          w="100%"
        >
          {[1, 2, 3].map((i) => (
            <Flex key={i} direction="column" align="center">
              <CustomIcon 
                icon={FiArrowRight} 
                color={arrowColor} 
                boxSize={4} 
                mb={2}
                transform="rotate(90deg)"
              />
              <Box
                w="40px"
                h="40px"
                borderRadius="md"
                bg={dataColor}
                display="flex"
                alignItems="center"
                justifyContent="center"
                boxShadow="sm"
              >
                <CustomIcon icon={FiDatabase} color="white" boxSize={4} />
              </Box>
              <Text fontSize="xs" color={subTextColor}>
                Local Data
              </Text>
            </Flex>
          ))}
        </MotionFlex>
      </Flex>
      
      <Divider my={3} />
      
      {/* Description of the federation */}
      <Box mt={3}>
        <Text fontSize="xs" color={subTextColor} lineHeight="1.4">
          <Text as="span" fontWeight="medium" color={textColor}>
            {aggregator.toUpperCase()}:
          </Text>{' '}
          {aggregatorDescription[aggregator]}
        </Text>
        
        <Text fontSize="xs" color={subTextColor} mt={2} lineHeight="1.4">
          <Text as="span" fontWeight="medium" color={textColor}>
            Privacy:
          </Text>{' '}
          {privacyDescription[privacy ?? 'null']}
        </Text>
      </Box>
    </Box>
  );
};

export default FederationSchema;